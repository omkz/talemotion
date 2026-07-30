from collections.abc import Iterator

from fastapi.testclient import TestClient

from app.api.v1.scene_runs import get_scene_media_generator
from app.core.config import AppConfig
from app.core.sse import encode_media_key
from app.main import app
from app.media.genblaze_scene import GenblazeSceneGenerator
from app.schemas.scene_run import (
    SceneImageCompletedEvent,
    SceneImageProgressEvent,
    SceneImageStartedEvent,
    SceneRunAsset,
    SceneRunCompletedEvent,
    SceneRunEvent,
    SceneRunFailedEvent,
    SceneRunRequest,
    SceneRunStartedEvent,
    SceneVideoCompletedEvent,
    SceneVideoProgressEvent,
    SceneVideoStartedEvent,
)

REQUEST = {
    "project_id": "project_majapahit",
    "scene_id": "scene_majapahit_01",
    "title": "An Empire Emerges",
    "visual_prompt": "A plausible Majapahit port at sunrise.",
    "aspect_ratio": "9:16",
    "duration_seconds": 5,
    "generate_video": True,
}

IMAGE = SceneRunAsset(
    kind="image",
    media_type="image/png",
    asset_url="s3://bucket/talemotion/image.png",
    preview_url="/api/v1/media/image/preview",
    sha256="a" * 64,
    model="image-model",
)
VIDEO = SceneRunAsset(
    kind="video",
    media_type="video/mp4",
    asset_url="s3://bucket/talemotion/video.mp4",
    preview_url="/api/v1/media/video/preview",
    sha256="b" * 64,
    model="video-model",
)


class FakeGenerator:
    def __init__(self, *, video: bool = True, fail_video: bool = False) -> None:
        self.video = video
        self.fail_video = fail_video

    def run(
        self, request: SceneRunRequest, run_id: str
    ) -> Iterator[SceneRunEvent]:
        common = {
            "run_id": run_id,
            "project_id": request.project_id,
            "scene_id": request.scene_id,
        }
        yield SceneRunStartedEvent(**common)
        yield SceneImageStartedEvent(model="image-model", **common)
        yield SceneImageProgressEvent(progress=40, **common)
        yield SceneImageCompletedEvent(
            asset=IMAGE, manifest_url="s3://bucket/image-manifest.json", **common
        )
        if not self.video:
            yield SceneRunCompletedEvent(
                image=IMAGE,
                video=None,
                manifest_url="s3://bucket/image-manifest.json",
                **common,
            )
            return
        yield SceneVideoStartedEvent(model="video-model", **common)
        yield SceneVideoProgressEvent(progress=65, **common)
        if self.fail_video:
            yield SceneRunFailedEvent(
                code="provider_generation_failed",
                message="The media provider could not generate this scene.",
                retryable=True,
                image=IMAGE,
                **common,
            )
            return
        yield SceneVideoCompletedEvent(
            asset=VIDEO, manifest_url="s3://bucket/video-manifest.json", **common
        )
        yield SceneRunCompletedEvent(
            image=IMAGE,
            video=VIDEO,
            manifest_url="s3://bucket/video-manifest.json",
            **common,
        )

    def presign_preview(self, key: str) -> str:
        return f"https://signed.example.invalid/{key}"


def _event_types(response_text: str) -> list[str]:
    return [
        line.removeprefix("event: ")
        for line in response_text.splitlines()
        if line.startswith("event: ")
    ]


def test_request_validation_rejects_empty_prompt(
    app_client: TestClient,
) -> None:
    response = app_client.post(
        "/api/v1/scene-runs/stream",
        json={**REQUEST, "visual_prompt": "  "},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_missing_configuration_is_streamed(
    app_client: TestClient,
) -> None:
    generator = GenblazeSceneGenerator(AppConfig(_env_file=None))
    app.dependency_overrides[get_scene_media_generator] = lambda: generator
    response = app_client.post("/api/v1/scene-runs/stream", json=REQUEST)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert _event_types(response.text) == [
        "scene_run.started",
        "scene_run.failed",
    ]
    assert "missing_configuration" in response.text


def test_unsupported_model_duration_is_rejected_before_generation(
    app_client: TestClient,
) -> None:
    generator = GenblazeSceneGenerator(AppConfig(_env_file=None))
    app.dependency_overrides[get_scene_media_generator] = lambda: generator
    response = app_client.post(
        "/api/v1/scene-runs/stream",
        json={**REQUEST, "duration_seconds": 9},
    )
    assert _event_types(response.text) == [
        "scene_run.started",
        "scene_run.failed",
    ]
    assert "invalid_request" in response.text


def test_image_only_event_order(app_client: TestClient) -> None:
    app.dependency_overrides[get_scene_media_generator] = lambda: FakeGenerator(
        video=False
    )
    response = app_client.post(
        "/api/v1/scene-runs/stream",
        json={**REQUEST, "generate_video": False},
    )
    assert _event_types(response.text) == [
        "scene_run.started",
        "scene_image.started",
        "scene_image.progress",
        "scene_image.completed",
        "scene_run.completed",
    ]
    assert "\n\ndata:" not in response.text


def test_image_and_video_event_order(app_client: TestClient) -> None:
    app.dependency_overrides[get_scene_media_generator] = FakeGenerator
    response = app_client.post("/api/v1/scene-runs/stream", json=REQUEST)
    assert _event_types(response.text) == [
        "scene_run.started",
        "scene_image.started",
        "scene_image.progress",
        "scene_image.completed",
        "scene_video.started",
        "scene_video.progress",
        "scene_video.completed",
        "scene_run.completed",
    ]


def test_image_is_preserved_when_video_fails(
    app_client: TestClient,
) -> None:
    app.dependency_overrides[get_scene_media_generator] = lambda: FakeGenerator(
        fail_video=True
    )
    response = app_client.post("/api/v1/scene-runs/stream", json=REQUEST)
    assert _event_types(response.text)[-1] == "scene_run.failed"
    assert '"image":' in response.text
    assert '"retryable":true' in response.text


def test_unexpected_provider_error_is_sanitized() -> None:
    generator = GenblazeSceneGenerator(AppConfig(_env_file=None))
    mapped = generator._map_error(  # noqa: SLF001
        RuntimeError("secret-token should never reach the client")
    )
    assert mapped.code == "unknown_error"
    assert "secret-token" not in mapped.message


def test_preview_redirect_validates_talemotion_key(
    app_client: TestClient,
) -> None:
    app.dependency_overrides[get_scene_media_generator] = FakeGenerator
    key = "talemotion/projects/p/scenes/s/runs/r/image.png"
    response = app_client.get(
        f"/api/v1/media/{encode_media_key(key)}/preview",
        follow_redirects=False,
    )
    assert response.status_code == 307
    assert response.headers["location"].endswith(key)

    invalid = encode_media_key("talemotion/projects/p/../../secret")
    response = app_client.get(
        f"/api/v1/media/{invalid}/preview",
        follow_redirects=False,
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "media_not_found"


def test_integration_health_does_not_call_providers(
    app_client: TestClient,
) -> None:
    response = app_client.get("/api/v1/health/integrations")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert isinstance(body["integrations"]["b2_configured"], bool)
    assert isinstance(body["integrations"]["gmicloud_configured"], bool)
