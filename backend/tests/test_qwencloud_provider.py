import json
from types import SimpleNamespace

import httpx
import pytest
from genblaze_core import Asset
from genblaze_core.exceptions import ProviderError as GenblazeProviderError
from genblaze_core.models.enums import Modality, ProviderErrorCode
from genblaze_core.models.step import Step
from genblaze_core.providers import ValidationOutcome
from pydantic import SecretStr

from app.core.config import AppConfig
from app.providers import ProviderCapability, ProviderError, ProviderSelection
from app.providers.catalog import default_selection, validate_selection
from app.providers.media import qwencloud
from app.providers.media.qwencloud import QwenCloudProvider
from app.providers.media.registry import create_media_adapter


def config(**updates: object) -> AppConfig:
    values: dict[str, object] = {
        "database_url": "postgresql+psycopg://test:test@localhost/test",
        "redis_url": "redis://localhost:6379/15",
        "celery_broker_url": "redis://localhost:6379/15",
        "dashscope_api_key": SecretStr("dashscope-secret"),
        "talemotion_image_provider": "qwencloud",
        "talemotion_image_model": None,
        "talemotion_video_provider": "qwencloud",
        "talemotion_video_model": None,
        "talemotion_video_durations": "5",
        "_env_file": None,
    }
    values.update(updates)
    return AppConfig(**values)


def provider(
    handler,
    *,
    base_url: str = "https://dashscope.example.test/api/v1",
) -> QwenCloudProvider:
    return QwenCloudProvider(
        api_key="test-key",
        base_url=base_url,
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )


def image_step(*, aspect_ratio: str = "9:16") -> Step:
    return Step(
        provider="qwencloud",
        model="wan2.6-t2i",
        modality=Modality.IMAGE,
        prompt="A cinematic historical harbor",
        params={"aspect_ratio": aspect_ratio},
    )


def video_step(*, duration: int = 5) -> Step:
    return Step(
        provider="qwencloud",
        model="wan2.6-i2v-flash",
        modality=Modality.VIDEO,
        prompt="Animate the harbor with subtle camera movement",
        params={"duration": duration, "aspect_ratio": "9:16"},
        inputs=[
            Asset(
                url="https://b2.example.test/signed-keyframe.png",
                media_type="image/png",
                sha256="a" * 64,
            )
        ],
    )


def async_response(task_id: str = "task-1") -> dict[str, object]:
    return {"output": {"task_id": task_id}, "request_id": "request-1"}


def test_qwencloud_default_selections_and_duration_subset() -> None:
    current = config()
    image = default_selection(current, ProviderCapability.IMAGE)
    video = default_selection(current, ProviderCapability.VIDEO)

    assert image == ProviderSelection(
        capability="image",
        provider="qwencloud",
        model="wan2.6-t2i",
    )
    assert video == ProviderSelection(
        capability="video",
        provider="qwencloud",
        model="wan2.6-i2v-flash",
    )
    validate_selection(current, image, aspect_ratio="9:16")
    validate_selection(
        current,
        video,
        aspect_ratio="9:16",
        duration_seconds=5,
    )
    with pytest.raises(ProviderError) as raised:
        validate_selection(current, video, duration_seconds=6)
    assert raised.value.code == "unsupported_parameters"


def test_qwencloud_missing_key_fails_before_provider_construction(
    monkeypatch,
) -> None:
    constructions = 0

    def construct(**_kwargs):
        nonlocal constructions
        constructions += 1
        return object()

    monkeypatch.setattr(qwencloud, "QwenCloudProvider", construct)
    current = config(dashscope_api_key=None)
    selection = default_selection(current, ProviderCapability.IMAGE)

    with pytest.raises(ProviderError) as raised:
        create_media_adapter(current, selection)

    assert raised.value.code == "missing_configuration"
    assert "DASHSCOPE_API_KEY" in raised.value.message
    assert constructions == 0


def test_dashscope_media_base_url_is_separate_and_normalized() -> None:
    current = config(
        dashscope_base_url="https://storyboard.example.test/compatible-mode/v1",
        dashscope_media_base_url=" https://media.example.test/api/v1/// ",
    )

    assert current.dashscope_media_base_url == "https://media.example.test/api/v1"
    assert current.dashscope_base_url == (
        "https://storyboard.example.test/compatible-mode/v1"
    )


@pytest.mark.parametrize(
    ("aspect_ratio", "expected_size"),
    (("9:16", "960*1696"), ("16:9", "1696*960")),
)
def test_image_submission_maps_size_and_async_options(
    aspect_ratio: str,
    expected_size: str,
) -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=async_response())

    task_id = provider(handler).submit(image_step(aspect_ratio=aspect_ratio))

    assert task_id == "task-1"
    request = requests[0]
    assert request.url.path.endswith(
        "/services/aigc/image-generation/generation"
    )
    assert request.headers["Authorization"] == "Bearer test-key"
    assert request.headers["X-DashScope-Async"] == "enable"
    payload = json.loads(request.content)
    assert payload["parameters"] == {
        "prompt_extend": True,
        "watermark": False,
        "n": 1,
        "negative_prompt": "",
        "size": expected_size,
    }


def test_unsupported_image_ratio_fails_before_http_request() -> None:
    calls = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json=async_response())

    with pytest.raises(GenblazeProviderError) as raised:
        provider(handler).submit(image_step(aspect_ratio="1:1"))

    assert raised.value.error_code is ProviderErrorCode.INVALID_INPUT
    assert calls == 0


def test_video_submission_uses_signed_image_and_silent_options() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=async_response("video-task"))

    task_id = provider(handler).submit(video_step(duration=7))

    assert task_id == "video-task"
    payload = json.loads(requests[0].content)
    assert payload["input"]["img_url"] == (
        "https://b2.example.test/signed-keyframe.png"
    )
    assert payload["parameters"] == {
        "audio": False,
        "resolution": "720P",
        "prompt_extend": True,
        "watermark": False,
        "duration": 7,
    }
    assert "aspect_ratio" not in payload["parameters"]


def test_video_adapter_propagates_image_integrity_and_lineage() -> None:
    current = config()
    selection = default_selection(current, ProviderCapability.VIDEO)
    adapter = create_media_adapter(current, selection)
    source = Asset(
        url="https://durable.example.test/image.webp",
        media_type="image/webp",
        sha256="b" * 64,
    )
    result = SimpleNamespace(
        run=SimpleNamespace(
            steps=[SimpleNamespace(assets=[source])],
        )
    )

    inputs = adapter.video_inputs(
        image_result=result,  # type: ignore[arg-type]
        signed_image_url="https://b2.example.test/signed-image.webp",
    )
    external = inputs["external_inputs"]

    assert adapter.inherit_parent_result
    assert isinstance(external, list)
    assert len(external) == 1
    assert external[0].url == "https://b2.example.test/signed-image.webp"
    assert external[0].media_type == "image/webp"
    assert external[0].sha256 == "b" * 64


def test_video_adapter_rejects_missing_parent_image() -> None:
    adapter = create_media_adapter(
        config(),
        default_selection(config(), ProviderCapability.VIDEO),
    )
    result = SimpleNamespace(run=SimpleNamespace(steps=[]))

    with pytest.raises(ProviderError) as raised:
        adapter.video_inputs(
            image_result=result,  # type: ignore[arg-type]
            signed_image_url="https://b2.example.test/signed-image.png",
        )

    assert raised.value.code == "unsupported_parameters"


@pytest.mark.parametrize("status", ["PENDING", "RUNNING"])
def test_polling_reports_nonterminal_status(status: str) -> None:
    calls = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json={"output": {"task_status": status}})

    assert not provider(handler).poll("task-1")
    assert calls == 1


@pytest.mark.parametrize("status", ["SUCCEEDED", "FAILED", "CANCELED", "UNKNOWN"])
def test_polling_caches_terminal_payload(status: str) -> None:
    calls = 0
    payload = {
        "output": {
            "task_status": status,
            "choices": [
                {
                    "message": {
                        "content": [
                            {"image": "https://output.example.test/image.png"}
                        ]
                    }
                }
            ],
        }
    }

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json=payload)

    current = provider(handler)
    assert current.poll("task-1")
    if status == "SUCCEEDED":
        current.fetch_output("task-1", image_step())
    else:
        with pytest.raises(GenblazeProviderError):
            current.fetch_output("task-1", image_step())
    assert calls == 1


def test_image_and_video_result_parsing() -> None:
    responses = {
        "image": {
            "output": {
                "task_status": "SUCCEEDED",
                "choices": [
                    {
                        "message": {
                            "content": [
                                {
                                    "image": (
                                        "https://output.example.test/image.jpeg"
                                    )
                                }
                            ]
                        }
                    }
                ],
            },
            "request_id": "image-request",
            "usage": {"image_count": 1},
        },
        "video": {
            "output": {
                "task_status": "SUCCEEDED",
                "video_url": "https://output.example.test/video.mp4",
            }
        },
    }

    image_provider = provider(
        lambda _request: httpx.Response(200, json=responses["image"])
    )
    image = image_provider.fetch_output("image-task", image_step())
    video_provider = provider(
        lambda _request: httpx.Response(200, json=responses["video"])
    )
    video = video_provider.fetch_output("video-task", video_step())

    assert len(image.assets) == 1
    assert image.assets[0].media_type == "image/jpeg"
    assert image.provider_payload["qwencloud"]["usage"] == {"image_count": 1}
    assert len(video.assets) == 1
    assert video.assets[0].media_type == "video/mp4"
    assert video.assets[0].video is not None
    assert video.assets[0].video.has_audio is False
    assert video.assets[0].video.codec == "h264"


def test_failed_task_retains_provider_code_and_message() -> None:
    payload = {
        "output": {
            "task_status": "FAILED",
            "code": "DataInspectionFailed",
            "message": "The prompt was rejected by content policy.",
        }
    }
    current = provider(lambda _request: httpx.Response(200, json=payload))

    assert current.poll("failed-task")
    with pytest.raises(GenblazeProviderError) as raised:
        current.fetch_output("failed-task", image_step())

    assert raised.value.error_code is ProviderErrorCode.CONTENT_POLICY
    assert "DataInspectionFailed" in str(raised.value)
    assert "rejected by content policy" in str(raised.value)


@pytest.mark.parametrize(
    ("status", "message", "expected"),
    (
        (401, "Unauthorized", ProviderErrorCode.AUTH_FAILURE),
        (403, "Forbidden", ProviderErrorCode.AUTH_FAILURE),
        (429, "Rate limited", ProviderErrorCode.RATE_LIMIT),
        (500, "Server error", ProviderErrorCode.SERVER_ERROR),
        (503, "Unavailable", ProviderErrorCode.SERVER_ERROR),
        (402, "Insufficient credit", ProviderErrorCode.INVALID_INPUT),
    ),
)
def test_http_error_mapping(
    status: int,
    message: str,
    expected: ProviderErrorCode,
) -> None:
    current = provider(
        lambda _request: httpx.Response(
            status,
            json={"code": "ProviderError", "message": message},
        )
    )

    with pytest.raises(GenblazeProviderError) as raised:
        current.submit(image_step())

    assert raised.value.error_code is expected


def test_timeout_maps_to_timeout() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timed out", request=request)

    with pytest.raises(GenblazeProviderError) as raised:
        provider(handler).submit(image_step())

    assert raised.value.error_code is ProviderErrorCode.TIMEOUT


def test_adapters_reject_unsupported_combinations_before_side_effects(
    monkeypatch,
) -> None:
    constructions = 0

    def construct(**_kwargs):
        nonlocal constructions
        constructions += 1
        return object()

    monkeypatch.setattr(qwencloud, "QwenCloudProvider", construct)
    for capability in (
        ProviderCapability.STORYBOARD,
        ProviderCapability.TTS,
        ProviderCapability.MUSIC,
    ):
        selection = ProviderSelection(
            capability=capability,
            provider="qwencloud",
            model="unsupported",
        )
        with pytest.raises(ProviderError) as raised:
            create_media_adapter(config(), selection)
        assert raised.value.code == "unsupported_parameters"
    assert constructions == 0


def test_qwencloud_models_are_authoritative_in_genblaze_preflight() -> None:
    current = provider(
        lambda _request: httpx.Response(500, json={"message": "unused"})
    )

    for model in ("wan2.6-t2i", "wan2.6-i2v-flash"):
        result = current.validate_model(model)
        assert result.outcome is ValidationOutcome.OK_AUTHORITATIVE
