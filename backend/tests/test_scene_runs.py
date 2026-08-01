from app.core.config import AppConfig
from app.media.genblaze_scene import GenblazeSceneGenerator
from app.schemas.scene_run import SceneRunAsset, SceneRunRequest


def request(*, duration_seconds: int = 5) -> SceneRunRequest:
    return SceneRunRequest(
        project_id="project_majapahit",
        scene_id="scene_majapahit_01",
        title="An Empire Emerges",
        visual_prompt="A plausible Majapahit port at sunrise.",
        aspect_ratio="9:16",
        duration_seconds=duration_seconds,
        generate_video=True,
    )


def test_missing_configuration_becomes_a_sanitized_failure_event() -> None:
    constructed = 0

    def adapter_constructor(_config, _selection):
        nonlocal constructed
        constructed += 1
        return object()

    generator = GenblazeSceneGenerator(
        AppConfig(_env_file=None),
        adapter_constructor=adapter_constructor,
    )
    events = list(generator.run(request(), "run_123"))
    assert [event.type for event in events] == [
        "scene_run.started",
        "scene_run.failed",
    ]
    failure = events[-1]
    assert failure.type == "scene_run.failed"
    assert failure.code == "missing_configuration"
    assert failure.retryable is False
    assert constructed == 0


def test_unsupported_model_duration_is_rejected_before_generation() -> None:
    constructed = 0

    def adapter_constructor(_config, _selection):
        nonlocal constructed
        constructed += 1
        return object()

    generator = GenblazeSceneGenerator(
        AppConfig(_env_file=None),
        adapter_constructor=adapter_constructor,
    )
    events = list(generator.run(request(duration_seconds=9), "run_123"))
    failure = events[-1]
    assert failure.type == "scene_run.failed"
    assert failure.code == "unsupported_parameters"
    assert constructed == 0


def test_unexpected_provider_error_is_sanitized() -> None:
    generator = GenblazeSceneGenerator(AppConfig(_env_file=None))
    mapped = generator._map_error(  # noqa: SLF001
        RuntimeError("secret-token should never reach the client")
    )
    assert mapped.code == "provider_generation_failed"
    assert "secret-token" not in mapped.message


def test_scene_run_asset_accepts_a_provider_neutral_name() -> None:
    asset = SceneRunAsset(
        kind="image",
        media_type="image/png",
        asset_url="s3://bucket/talemotion/image.png",
        sha256="a" * 64,
        storage_object_key="talemotion/projects/project/scenes/scene/image.png",
        provider="future-provider",
        model="future-image-model",
    )
    assert asset.provider == "future-provider"
