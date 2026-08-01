from pydantic import SecretStr

from app.core.config import AppConfig
from app.providers import ProviderCapability, ProviderError, ProviderSelection
from app.providers.catalog import (
    default_selection,
    provider_entry,
    validate_selection,
)
from app.providers.selection import (
    configured_selections,
    payload_with_selections,
    selections_from_payload,
)


def config(**updates: object) -> AppConfig:
    values: dict[str, object] = {
        "database_url": "postgresql+psycopg://test:test@localhost/test",
        "redis_url": "redis://localhost:6379/15",
        "celery_broker_url": "redis://localhost:6379/15",
        "talemotion_storyboard_provider": "alibaba",
        "talemotion_storyboard_model": "qwen-plus",
        "talemotion_image_provider": "gmicloud",
        "talemotion_image_model": "seedream-5.0-lite",
        "talemotion_video_provider": "gmicloud",
        "talemotion_video_model": "wan2.6-i2v",
        "talemotion_tts_provider": "gmicloud",
        "talemotion_tts_model": "tts-model",
        "talemotion_music_provider": "gmicloud",
        "talemotion_music_model": "music-model",
        "dashscope_api_key": SecretStr("dashscope-secret"),
        "gmi_api_key": SecretStr("gmi-secret"),
        "_env_file": None,
    }
    values.update(updates)
    return AppConfig(**values)


def test_capability_defaults_resolve_independently() -> None:
    current = config()
    assert default_selection(current, ProviderCapability.STORYBOARD) == (
        ProviderSelection(
            capability="storyboard", provider="alibaba", model="qwen-plus"
        )
    )
    assert default_selection(current, ProviderCapability.IMAGE).model == (
        "seedream-5.0-lite"
    )
    assert default_selection(current, ProviderCapability.VIDEO).model == (
        "wan2.6-i2v"
    )
    assert default_selection(current, ProviderCapability.TTS).model == "tts-model"
    assert default_selection(current, ProviderCapability.MUSIC).model == (
        "music-model"
    )


def test_openai_storyboard_selection_is_independent_from_media() -> None:
    current = config(
        talemotion_storyboard_provider="openai",
        talemotion_storyboard_model="gpt-5-mini",
        openai_api_key=SecretStr("openai-secret"),
    )
    storyboard = default_selection(current, ProviderCapability.STORYBOARD)
    image = default_selection(current, ProviderCapability.IMAGE)
    assert (storyboard.provider, storyboard.model) == ("openai", "gpt-5-mini")
    assert (image.provider, image.model) == ("gmicloud", "seedream-5.0-lite")


def test_unknown_provider_capability_fails_clearly() -> None:
    try:
        provider_entry(ProviderCapability.VIDEO, "openai")
    except ProviderError as error:
        assert error.code == "unsupported_parameters"
        assert not error.retryable
    else:  # pragma: no cover
        raise AssertionError("Unsupported provider should fail.")


def test_missing_credentials_and_unsupported_duration_fail_before_call() -> None:
    selection = default_selection(config(), ProviderCapability.VIDEO)
    try:
        validate_selection(
            config(gmi_api_key=None), selection, duration_seconds=5
        )
    except ProviderError as error:
        assert error.code == "missing_configuration"
        assert "GMI_API_KEY" in error.message
    else:  # pragma: no cover
        raise AssertionError("Missing credentials should fail.")

    try:
        validate_selection(
            config(gmi_api_key=None), selection, duration_seconds=9
        )
    except ProviderError as error:
        assert error.code == "unsupported_parameters"
        assert not error.retryable
    else:  # pragma: no cover
        raise AssertionError("Unsupported duration should fail first.")


def test_job_snapshot_is_safe_immutable_and_legacy_compatible() -> None:
    original = config()
    selections = configured_selections(
        original, (ProviderCapability.IMAGE, ProviderCapability.VIDEO)
    )
    payload = payload_with_selections({"generate_video": True}, selections)
    serialized = str(payload)
    assert "dashscope-secret" not in serialized
    assert "gmi-secret" not in serialized

    changed = config(
        talemotion_image_model="future-image-model",
        talemotion_video_model="future-video-model",
    )
    restored, legacy = selections_from_payload(
        payload,
        (ProviderCapability.IMAGE, ProviderCapability.VIDEO),
        changed,
    )
    assert not legacy
    assert restored[ProviderCapability.IMAGE].model == "seedream-5.0-lite"
    assert restored[ProviderCapability.VIDEO].model == "wan2.6-i2v"

    legacy_resolved, legacy = selections_from_payload(
        {"generate_video": True},
        (ProviderCapability.IMAGE, ProviderCapability.VIDEO),
        changed,
    )
    assert legacy
    assert legacy_resolved[ProviderCapability.IMAGE].model == (
        "future-image-model"
    )
