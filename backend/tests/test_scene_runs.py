from app.core.config import AppConfig
from app.media.genblaze_scene import GenblazeSceneGenerator
from app.schemas.scene_run import SceneRunRequest


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
    generator = GenblazeSceneGenerator(AppConfig(_env_file=None))
    events = list(generator.run(request(), "run_123"))
    assert [event.type for event in events] == [
        "scene_run.started",
        "scene_run.failed",
    ]
    failure = events[-1]
    assert failure.type == "scene_run.failed"
    assert failure.code == "missing_configuration"
    assert failure.retryable is False


def test_unsupported_model_duration_is_rejected_before_generation() -> None:
    generator = GenblazeSceneGenerator(AppConfig(_env_file=None))
    events = list(generator.run(request(duration_seconds=9), "run_123"))
    failure = events[-1]
    assert failure.type == "scene_run.failed"
    assert failure.code == "unsupported_parameters"


def test_unexpected_provider_error_is_sanitized() -> None:
    generator = GenblazeSceneGenerator(AppConfig(_env_file=None))
    mapped = generator._map_error(  # noqa: SLF001
        RuntimeError("secret-token should never reach the client")
    )
    assert mapped.code == "provider_generation_failed"
    assert "secret-token" not in mapped.message
