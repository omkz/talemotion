import pytest
from pydantic import SecretStr
from pydantic_ai.exceptions import ModelHTTPError, UnexpectedModelBehavior
from pydantic_ai.models.test import TestModel

from app.core.config import AppConfig
from app.media import SceneMediaError
from app.models.project import ContentType, ProjectTone
from app.providers import ProviderCapability
from app.providers.catalog import provider_entry
from app.providers.storyboard import pydantic_ai as storyboard_provider
from app.providers.storyboard.pydantic_ai import (
    PydanticAIStoryboardGenerator,
    build_storyboard_prompt,
    map_storyboard_error,
    resolved_storyboard_model,
)
from app.schemas.storyboard import HistoricalStoryboardDraft, StoryboardProjectSnapshot
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


def _brief(**updates: object) -> StoryboardProjectSnapshot:
    values: dict[str, object] = {
        "title": "The Rise of Majapahit",
        "topic": "The rise of Majapahit",
        "source_notes": "Use the Nagarakretagama as user-provided context.",
        "content_type": ContentType.DOCUMENTARY,
        "language": "en",
        "tone": ProjectTone.CINEMATIC,
        "target_audience": "General audience",
        "additional_direction": "Emphasize maritime strategy",
        "historical_accuracy_note": "Avoid unsupported certainty",
        "visual_style": "Cinematic historical realism",
        "narration_style": "dramatic documentary",
        "duration_seconds": 30,
        "aspect_ratio": "9:16",
        "narration_enabled": True,
        "captions_enabled": False,
        "music_enabled": False,
    }
    values.update(updates)
    return StoryboardProjectSnapshot.model_validate(values)


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


def test_alibaba_storyboard_disables_thinking_for_structured_output() -> None:
    selection = _config(
        talemotion_storyboard_model="qwen3.7-plus"
    ).default_provider_selection(ProviderCapability.STORYBOARD)

    settings = storyboard_provider._storyboard_model_settings(  # noqa: SLF001
        selection
    )

    assert settings["temperature"] == 0.4
    assert settings["max_tokens"] == 3000
    assert settings["timeout"] == 120
    assert settings["extra_body"] == {"enable_thinking": False}


def test_openai_storyboard_does_not_receive_alibaba_thinking_settings() -> None:
    selection = _config(
        talemotion_storyboard_provider="openai",
        talemotion_storyboard_model="gpt-5-mini",
        openai_api_key=SecretStr("test-openai-key"),
    ).default_provider_selection(ProviderCapability.STORYBOARD)

    settings = storyboard_provider._storyboard_model_settings(  # noqa: SLF001
        selection
    )

    assert settings["temperature"] == 0.4
    assert settings["max_tokens"] == 3000
    assert settings["timeout"] == 120
    assert "extra_body" not in settings


def test_alibaba_provider_receives_trimmed_dashscope_base_url(
    monkeypatch,
) -> None:
    constructed: list[dict[str, object]] = []

    class FakeProvider:
        def __init__(self, **kwargs: object) -> None:
            constructed.append(kwargs)

    monkeypatch.setattr(
        storyboard_provider,
        "infer_provider_class",
        lambda _name: FakeProvider,
    )
    config = _config(
        dashscope_base_url=(
            "  https://example.alibaba.test/compatible-mode/v1  "
        )
    )
    selection = config.default_provider_selection(
        ProviderCapability.STORYBOARD
    )

    storyboard_provider._configured_provider(  # noqa: SLF001
        config,
        selection,
        "dashscope-key",
        "alibaba",
    )

    assert config.dashscope_base_url == (
        "https://example.alibaba.test/compatible-mode/v1"
    )
    assert constructed == [
        {
            "api_key": "dashscope-key",
            "base_url": "https://example.alibaba.test/compatible-mode/v1",
        }
    ]


def test_configured_model_passes_catalog_api_key_to_alibaba(monkeypatch) -> None:
    constructed: list[dict[str, object]] = []
    identifiers: list[str] = []

    class FakeProvider:
        def __init__(self, **kwargs: object) -> None:
            constructed.append(kwargs)

    def infer_model(identifier: str, *, provider_factory):
        identifiers.append(identifier)
        return provider_factory("alibaba")

    monkeypatch.setattr(
        storyboard_provider,
        "infer_provider_class",
        lambda _name: FakeProvider,
    )
    monkeypatch.setattr(storyboard_provider, "infer_model", infer_model)
    config = _config(dashscope_api_key=SecretStr("configured-dashscope-key"))
    selection = config.default_provider_selection(
        ProviderCapability.STORYBOARD
    )

    storyboard_provider._configured_model(config, selection)  # noqa: SLF001

    assert identifiers == ["alibaba:qwen-plus"]
    assert constructed == [{"api_key": "configured-dashscope-key"}]


def test_alibaba_provider_omits_base_url_when_unset(monkeypatch) -> None:
    constructed: list[dict[str, object]] = []

    class FakeProvider:
        def __init__(self, **kwargs: object) -> None:
            constructed.append(kwargs)

    monkeypatch.setattr(
        storyboard_provider,
        "infer_provider_class",
        lambda _name: FakeProvider,
    )
    for value in (None, "", "   "):
        config = _config(dashscope_base_url=value)
        selection = config.default_provider_selection(
            ProviderCapability.STORYBOARD
        )
        storyboard_provider._configured_provider(  # noqa: SLF001
            config,
            selection,
            "dashscope-key",
            "alibaba",
        )
        assert config.dashscope_base_url is None

    assert constructed == [{"api_key": "dashscope-key"}] * 3


def test_openai_provider_never_receives_dashscope_base_url(monkeypatch) -> None:
    constructed: list[dict[str, object]] = []

    class FakeProvider:
        def __init__(self, **kwargs: object) -> None:
            constructed.append(kwargs)

    monkeypatch.setattr(
        storyboard_provider,
        "infer_provider_class",
        lambda _name: FakeProvider,
    )
    config = _config(
        talemotion_storyboard_provider="openai",
        talemotion_storyboard_model="gpt-5-mini",
        openai_api_key=SecretStr("openai-key"),
        dashscope_base_url="https://dashscope.example.invalid/v1",
    )
    selection = config.default_provider_selection(
        ProviderCapability.STORYBOARD
    )

    storyboard_provider._configured_provider(  # noqa: SLF001
        config,
        selection,
        "openai-key",
        "openai",
    )

    assert constructed == [{"api_key": "openai-key"}]


def test_dashscope_credential_precedence_remains_unchanged() -> None:
    entry = provider_entry(ProviderCapability.STORYBOARD, "alibaba")
    config = _config(
        dashscope_api_key=SecretStr("dashscope-first"),
        alibaba_api_key=SecretStr("alibaba-second"),
    )
    assert entry.credential(config) == "dashscope-first"


def test_generator_uses_pydantic_ai_typed_output() -> None:
    model = TestModel(custom_output_args=_draft_arguments())
    generator = PydanticAIStoryboardGenerator(_config(), model=model)

    result = generator.generate(
        brief=_brief(),
    )

    assert isinstance(result, HistoricalStoryboardDraft)
    assert len(result.scenes) == 4
    assert [scene.position for scene in result.scenes] == [1, 2, 3, 4]
    assert _valid_duration(result, 30)


def test_storyboard_prompt_preserves_project_and_historical_constraints() -> None:
    prompt = build_storyboard_prompt(
        brief=_brief(
            topic="Majapahit maritime trade",
            additional_direction="Focus on political strategy",
            historical_accuracy_note="Treat disputed details cautiously",
            visual_style="Epic historical cinema",
            duration_seconds=45,
        ),
    )

    for expected in (
        "Majapahit maritime trade",
        "Focus on political strategy",
        "Treat disputed details cautiously",
        "Epic historical cinema",
        "45 seconds",
        "exactly four scenes",
        "Southeast Asian jong ships",
        "vertical 9:16",
        "Source notes:",
        "Additional direction:",
        "Output language:",
        "Target audience:",
        "Source notes: Use the Nagarakretagama as user-provided context.",
        "Additional direction: Focus on political strategy",
        "Output language: en",
        "Requested tone: cinematic",
    ):
        assert expected in prompt


@pytest.mark.parametrize(
    "content_type",
    [
        ContentType.DOCUMENTARY,
        ContentType.EDUCATIONAL,
        ContentType.EXPLAINER,
    ],
)
def test_story_approaches_preserve_the_complete_project_brief(
    content_type: ContentType,
) -> None:
    prompt = build_storyboard_prompt(
        brief=_brief(
            content_type=content_type,
            topic="The political and maritime rise of Majapahit",
            source_notes="Use inscriptions as unverified source context.",
            additional_direction="Emphasize diplomacy before conflict.",
            language="id",
            tone=ProjectTone.DRAMATIC,
            target_audience="Students",
            visual_style="Cinematic archival realism",
            narration_style="Measured historical narration",
            duration_seconds=45,
        )
    )

    for expected in (
        "The political and maritime rise of Majapahit",
        "Use inscriptions as unverified source context.",
        "Emphasize diplomacy before conflict.",
        "Output language: id",
        "Requested tone: dramatic",
        "Target audience: Students",
        "Visual style: Cinematic archival realism",
        "Narration style: Measured historical narration",
        "Target project duration: 45 seconds",
        "Create exactly four scenes",
        "historically plausible architecture",
        "avoid false certainty",
    ):
        assert expected in prompt


def test_documentary_prompt_uses_scene_driven_historical_progression() -> None:
    prompt = build_storyboard_prompt(
        brief=_brief(content_type=ContentType.DOCUMENTARY)
    )

    for expected in (
        "Strong visual hook and historical situation",
        "Main tension, conflict, or challenge",
        "Turning point, reversal, or decisive development",
        "Aftermath and lasting historical significance",
        "event's consequence, legacy, or historical significance",
    ):
        assert expected in prompt
    assert "what the viewer will understand" not in prompt
    assert "State one clear opening question" not in prompt


def test_educational_prompt_uses_ordered_learning_progression() -> None:
    prompt = build_storyboard_prompt(
        brief=_brief(content_type=ContentType.EDUCATIONAL)
    )

    for expected in (
        "what the viewer will understand",
        "essential context, actors, place, and chronology",
        "clear, factual, and logically ordered",
        "main learning takeaway",
        "most important thing the viewer should remember",
    ):
        assert expected in prompt
    assert "Main tension, conflict, or challenge" not in prompt
    assert "State one clear opening question" not in prompt


def test_explainer_prompt_uses_question_and_causal_progression() -> None:
    prompt = build_storyboard_prompt(
        brief=_brief(content_type=ContentType.EXPLAINER)
    )

    for expected in (
        "State one clear opening question",
        "cause, factor, or condition",
        "factors interacted or produced the outcome",
        "Answer the opening question explicitly",
        "Explicitly answer the opening question in the final scene",
    ):
        assert expected in prompt
    assert "Main tension, conflict, or challenge" not in prompt
    assert "what the viewer will understand" not in prompt


def test_story_approach_does_not_override_requested_tone() -> None:
    prompt = build_storyboard_prompt(
        brief=_brief(
            content_type=ContentType.EDUCATIONAL,
            tone=ProjectTone.DRAMATIC,
        )
    )

    assert "Story approach: educational" in prompt
    assert "Requested tone: dramatic" in prompt
    assert "Respect the separately requested tone" in prompt
    assert "without changing the selected story approach" in prompt


def test_legacy_content_type_uses_generic_historical_fallback() -> None:
    prompt = build_storyboard_prompt(
        brief=_brief(content_type=ContentType.FICTION)
    )

    assert "Story approach: fiction" in prompt
    assert "coherent four-scene historical narrative" in prompt
    assert "Establish the historical situation and context" in prompt
    assert "historical consequence, conclusion, or significance" in prompt
    assert "Strong visual hook and historical situation" not in prompt
    assert "what the viewer will understand" not in prompt
    assert "State one clear opening question" not in prompt


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
        brief=_brief(
            topic="Majapahit",
            additional_direction="",
            historical_accuracy_note=None,
        ),
    )
    assert not _valid_duration(result, 30)


def test_missing_dashscope_credentials_are_non_retryable() -> None:
    generator = PydanticAIStoryboardGenerator(
        _config(dashscope_api_key=None, alibaba_api_key=None)
    )
    try:
        generator.generate(
            brief=_brief(
                topic="Majapahit",
                additional_direction="",
                historical_accuracy_note=None,
            ),
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
    invalid = map_storyboard_error(UnexpectedModelBehavior("invalid output"))
    server = map_storyboard_error(
        ModelHTTPError(500, "qwen-plus", {"provider": "unavailable"})
    )
    generic = map_storyboard_error(RuntimeError("private provider response"))

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
    assert (invalid.code, invalid.retryable) == (
        "invalid_storyboard_output",
        True,
    )
    assert (server.code, server.retryable) == (
        "provider_generation_failed",
        True,
    )
    assert (generic.code, generic.retryable) == (
        "provider_generation_failed",
        True,
    )
    assert "private provider response" not in generic.message
