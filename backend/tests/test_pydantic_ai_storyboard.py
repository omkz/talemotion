from pydantic import SecretStr
from pydantic_ai.exceptions import ModelHTTPError
from pydantic_ai.models.test import TestModel

from app.core.config import AppConfig
from app.media import SceneMediaError
from app.providers.storyboard.pydantic_ai import (
    PydanticAIStoryboardGenerator,
    build_storyboard_prompt,
    map_storyboard_error,
    resolved_storyboard_model,
)
from app.schemas.storyboard import HistoricalStoryboardDraft
from app.tasks.storyboard import _valid_duration


def _config(**updates: object) -> AppConfig:
    values: dict[str, object] = {
        "database_url": "postgresql+psycopg://test:test@localhost/test",
        "redis_url": "redis://localhost:6379/15",
        "celery_broker_url": "redis://localhost:6379/15",
        "talemotion_storyboard_provider": "alibaba",
        "talemotion_storyboard_model": "qwen-plus",
        "dashscope_api_key": SecretStr("test-key"),
        "_env_file": None,
    }
    values.update(updates)
    return AppConfig(**values)


def _draft_arguments() -> dict[str, object]:
    durations = [8, 8, 7, 7]
    return {
        "scenes": [
            {
                "title": f"Scene {position}",
                "narration": f"Narration {position}",
                "visual_prompt": f"Vertical historical scene {position}",
                "duration_seconds": duration,
                "position": position,
            }
            for position, duration in enumerate(durations, start=1)
        ]
    }


def test_storyboard_model_resolution_supports_alibaba_and_openai() -> None:
    assert resolved_storyboard_model(_config()) == "alibaba:qwen-plus"
    assert (
        resolved_storyboard_model(
            _config(
                talemotion_storyboard_provider="openai",
                talemotion_storyboard_model="gpt-5-mini",
                openai_api_key=SecretStr("test-openai-key"),
            )
        )
        == "openai:gpt-5-mini"
    )


def test_generator_uses_pydantic_ai_typed_output() -> None:
    model = TestModel(custom_output_args=_draft_arguments())
    generator = PydanticAIStoryboardGenerator(_config(), model=model)

    result = generator.generate(
        topic="The rise of Majapahit",
        additional_direction="Emphasize maritime strategy",
        historical_accuracy_note="Avoid unsupported certainty",
        visual_style="Cinematic historical realism",
        duration_seconds=30,
    )

    assert isinstance(result, HistoricalStoryboardDraft)
    assert len(result.scenes) == 4
    assert [scene.position for scene in result.scenes] == [1, 2, 3, 4]
    assert _valid_duration(result, 30)


def test_storyboard_prompt_preserves_project_and_historical_constraints() -> None:
    prompt = build_storyboard_prompt(
        topic="Majapahit maritime trade",
        additional_direction="Focus on political strategy",
        historical_accuracy_note="Treat disputed details cautiously",
        visual_style="Epic historical cinema",
        duration_seconds=45,
    )

    for expected in (
        "Majapahit maritime trade",
        "Focus on political strategy",
        "Treat disputed details cautiously",
        "Epic historical cinema",
        "45-second",
        "exactly four scenes",
        "Southeast Asian jong ships",
        "vertical 9:16",
    ):
        assert expected in prompt


def test_duration_validation_rejects_incorrect_total() -> None:
    model = TestModel(
        custom_output_args={
            **_draft_arguments(),
            "scenes": [
                {**scene, "duration_seconds": 5}
                for scene in _draft_arguments()["scenes"]
            ],
        }
    )
    result = PydanticAIStoryboardGenerator(_config(), model=model).generate(
        topic="Majapahit",
        additional_direction="",
        historical_accuracy_note=None,
        visual_style="Cinematic",
        duration_seconds=30,
    )
    assert not _valid_duration(result, 30)


def test_missing_dashscope_credentials_are_non_retryable() -> None:
    generator = PydanticAIStoryboardGenerator(
        _config(dashscope_api_key=None, alibaba_api_key=None)
    )
    try:
        generator.generate(
            topic="Majapahit",
            additional_direction="",
            historical_accuracy_note=None,
            visual_style="Cinematic",
            duration_seconds=30,
        )
    except SceneMediaError as error:
        assert error.code == "missing_configuration"
        assert not error.retryable
        assert "DASHSCOPE_API_KEY or ALIBABA_API_KEY" in error.message
    else:  # pragma: no cover
        raise AssertionError("Missing credentials should stop generation.")


def test_provider_errors_map_to_stable_talemotion_codes() -> None:
    authentication = map_storyboard_error(
        ModelHTTPError(401, "qwen-plus", {"secret": "must not leak"})
    )
    rate_limit = map_storyboard_error(
        ModelHTTPError(429, "qwen-plus", {"provider": "busy"})
    )
    timeout = map_storyboard_error(TimeoutError("provider detail"))

    assert (authentication.code, authentication.retryable) == (
        "provider_authentication_failed",
        False,
    )
    assert "secret" not in authentication.message
    assert (rate_limit.code, rate_limit.retryable) == (
        "provider_rate_limited",
        True,
    )
    assert (timeout.code, timeout.retryable) == ("provider_timeout", True)
