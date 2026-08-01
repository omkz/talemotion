from types import SimpleNamespace

from pydantic import SecretStr

from app.core.config import AppConfig
from app.providers import (
    ModelCapabilities,
    ProviderCapability,
    ProviderError,
    ProviderSelection,
)
from app.providers import catalog as provider_catalog
from app.providers.catalog import (
    default_selection,
    provider_entry,
    validate_selection,
)
from app.providers.media import gmicloud as gmicloud_adapter
from app.providers.media import registry as media_registry
from app.providers.media import replicate as replicate_adapter
from app.providers.media.genblaze import GenblazeRenderMediaGateway
from app.providers.media.gmicloud import (
    create_gmicloud_audio_adapter,
    create_gmicloud_video_adapter,
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
        "replicate_api_token": SecretStr("replicate-secret"),
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


def test_model_capabilities_do_not_describe_runtime_image_handoff() -> None:
    assert "image_handoff" not in ModelCapabilities.model_fields


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


def test_replicate_image_catalog_resolves_with_its_default_model() -> None:
    gmicloud = default_selection(
        config(talemotion_image_model=None),
        ProviderCapability.IMAGE,
    )
    current = config(
        talemotion_image_provider="replicate",
        talemotion_image_model=None,
    )
    selection = default_selection(current, ProviderCapability.IMAGE)
    entry = provider_entry(ProviderCapability.IMAGE, "replicate")

    assert gmicloud.model == "seedream-5.0-lite"
    assert selection == ProviderSelection(
        capability="image",
        provider="replicate",
        model="black-forest-labs/flux-schnell",
    )
    assert entry.capabilities.supports_text_to_image
    validate_selection(current, selection, aspect_ratio="9:16")


def test_replicate_credentials_reject_missing_and_blank_tokens() -> None:
    selection = default_selection(
        config(
            talemotion_image_provider="replicate",
            talemotion_image_model=None,
        ),
        ProviderCapability.IMAGE,
    )
    for token in (None, SecretStr(""), SecretStr("   ")):
        try:
            validate_selection(
                config(replicate_api_token=token),
                selection,
            )
        except ProviderError as error:
            assert error.code == "missing_configuration"
            assert "REPLICATE_API_TOKEN" in error.message
            assert not error.retryable
        else:  # pragma: no cover
            raise AssertionError("Missing Replicate credentials should fail.")


def test_replicate_adapter_constructs_through_registry(monkeypatch) -> None:
    sentinel = object()
    tokens: list[str] = []

    def construct(*, api_token: str):
        tokens.append(api_token)
        return sentinel

    monkeypatch.setattr(replicate_adapter, "ReplicateProvider", construct)
    current = config(
        talemotion_image_provider="replicate",
        talemotion_image_model=None,
    )
    selection = default_selection(current, ProviderCapability.IMAGE)
    adapter = media_registry.create_media_adapter(current, selection)

    assert adapter.provider is sentinel
    assert tokens == ["replicate-secret"]


def test_missing_replicate_token_fails_before_provider_construction(
    monkeypatch,
) -> None:
    constructed = 0

    def construct(*, api_token: str):
        nonlocal constructed
        constructed += 1
        return object()

    monkeypatch.setattr(replicate_adapter, "ReplicateProvider", construct)
    current = config(
        talemotion_image_provider="replicate",
        talemotion_image_model=None,
        replicate_api_token=SecretStr(" "),
    )
    selection = default_selection(current, ProviderCapability.IMAGE)
    try:
        media_registry.create_media_adapter(current, selection)
    except ProviderError as error:
        assert error.code == "missing_configuration"
        assert "REPLICATE_API_TOKEN" in error.message
    else:  # pragma: no cover
        raise AssertionError("Missing token should fail before construction.")
    assert constructed == 0


def test_replicate_adapter_rejects_non_image_capabilities() -> None:
    for capability in (
        ProviderCapability.VIDEO,
        ProviderCapability.TTS,
        ProviderCapability.MUSIC,
        ProviderCapability.STORYBOARD,
    ):
        selection = ProviderSelection(
            capability=capability,
            provider="replicate",
            model="unsupported-model",
        )
        try:
            media_registry.create_media_adapter(config(), selection)
        except ProviderError as error:
            assert error.code == "unsupported_parameters"
            assert not error.retryable
        else:  # pragma: no cover
            raise AssertionError("Registry must reject Replicate capability.")
        try:
            replicate_adapter.create_replicate_image_adapter(
                config(), selection
            )
        except ProviderError as error:
            assert error.code == "unsupported_parameters"
            assert not error.retryable
        else:  # pragma: no cover
            raise AssertionError("Replicate must remain image-only.")


def test_replicate_adapter_rejects_wrong_provider_before_side_effects(
    monkeypatch,
) -> None:
    credential_lookups = 0
    constructions = 0

    def lookup(*_args, **_kwargs):
        nonlocal credential_lookups
        credential_lookups += 1
        raise AssertionError("Credential lookup must not run.")

    def construct(*_args, **_kwargs):
        nonlocal constructions
        constructions += 1
        raise AssertionError("Provider construction must not run.")

    monkeypatch.setattr(replicate_adapter, "provider_entry", lookup)
    monkeypatch.setattr(replicate_adapter, "ReplicateProvider", construct)
    selections = (
        ProviderSelection(
            capability="image",
            provider="gmicloud",
            model="seedream-5.0-lite",
        ),
        *(
            ProviderSelection(
                capability=capability,
                provider="replicate",
                model="unsupported-model",
            )
            for capability in (
                ProviderCapability.VIDEO,
                ProviderCapability.TTS,
                ProviderCapability.MUSIC,
                ProviderCapability.STORYBOARD,
            )
        ),
    )
    for selection in selections:
        try:
            replicate_adapter.create_replicate_image_adapter(config(), selection)
        except ProviderError as error:
            assert error.code == "unsupported_parameters"
            assert not error.retryable
        else:  # pragma: no cover
            raise AssertionError("Replicate adapter accepted a wrong selection.")
    assert credential_lookups == 0
    assert constructions == 0


def test_gmicloud_adapters_reject_wrong_providers_before_side_effects(
    monkeypatch,
) -> None:
    credential_lookups = 0
    constructions = 0

    def credential(*_args, **_kwargs):
        nonlocal credential_lookups
        credential_lookups += 1
        raise AssertionError("Credential lookup must not run.")

    def construct(*_args, **_kwargs):
        nonlocal constructions
        constructions += 1
        raise AssertionError("Provider construction must not run.")

    monkeypatch.setattr(gmicloud_adapter, "_credential", credential)
    monkeypatch.setattr(gmicloud_adapter, "GMICloudImageProvider", construct)
    monkeypatch.setattr(gmicloud_adapter, "GMICloudVideoProvider", construct)
    monkeypatch.setattr(gmicloud_adapter, "GMICloudAudioProvider", construct)
    cases = (
        (
            gmicloud_adapter.create_gmicloud_image_adapter,
            ProviderSelection(
                capability="image",
                provider="replicate",
                model="image-model",
            ),
        ),
        (
            gmicloud_adapter.create_gmicloud_video_adapter,
            ProviderSelection(
                capability="video",
                provider="replicate",
                model="video-model",
            ),
        ),
        (
            gmicloud_adapter.create_gmicloud_audio_adapter,
            ProviderSelection(
                capability="tts",
                provider="another-provider",
                model="voice-model",
            ),
        ),
        (
            gmicloud_adapter.create_gmicloud_audio_adapter,
            ProviderSelection(
                capability="storyboard",
                provider="gmicloud",
                model="storyboard-model",
            ),
        ),
    )
    for constructor, selection in cases:
        try:
            constructor(config(), selection)
        except ProviderError as error:
            assert error.code == "unsupported_parameters"
            assert not error.retryable
        else:  # pragma: no cover
            raise AssertionError("GMICloud adapter accepted a wrong selection.")
    assert credential_lookups == 0
    assert constructions == 0


def test_correct_gmicloud_adapters_construct_through_registry(monkeypatch) -> None:
    constructed: list[tuple[str, str]] = []

    class FakeRegistry:
        def fork(self):
            return self

    class FakeVideoProvider:
        @staticmethod
        def models_default() -> FakeRegistry:
            return FakeRegistry()

        def __init__(self, *, api_key: str, models: FakeRegistry) -> None:
            assert models is not None
            constructed.append(("video", api_key))

    def image_provider(*, api_key: str):
        constructed.append(("image", api_key))
        return object()

    def audio_provider(*, api_key: str):
        constructed.append(("audio", api_key))
        return object()

    monkeypatch.setattr(
        gmicloud_adapter, "GMICloudImageProvider", image_provider
    )
    monkeypatch.setattr(
        gmicloud_adapter, "GMICloudVideoProvider", FakeVideoProvider
    )
    monkeypatch.setattr(
        gmicloud_adapter, "GMICloudAudioProvider", audio_provider
    )
    selections = (
        ProviderSelection(
            capability="image", provider="gmicloud", model="image-model"
        ),
        ProviderSelection(
            capability="video", provider="gmicloud", model="video-model"
        ),
        ProviderSelection(
            capability="tts", provider="gmicloud", model="voice-model"
        ),
    )
    adapters = [
        media_registry.create_media_adapter(config(), selection)
        for selection in selections
    ]

    assert all(adapter.provider is not None for adapter in adapters)
    assert constructed == [
        ("image", "gmi-secret"),
        ("video", "gmi-secret"),
        ("audio", "gmi-secret"),
    ]


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


def test_catalog_supports_alibaba_alternative_credentials() -> None:
    selection = default_selection(config(), ProviderCapability.STORYBOARD)
    validate_selection(
        config(dashscope_api_key=None, alibaba_api_key=SecretStr("alternate")),
        selection,
    )
    entry = provider_entry(ProviderCapability.STORYBOARD, "alibaba")
    assert entry.required_configuration == (
        "DASHSCOPE_API_KEY or ALIBABA_API_KEY",
    )


def test_blank_gmicloud_credentials_are_missing() -> None:
    selection = default_selection(config(), ProviderCapability.IMAGE)
    for blank in (SecretStr(""), SecretStr("   ")):
        try:
            validate_selection(config(gmi_api_key=blank), selection)
        except ProviderError as error:
            assert error.code == "missing_configuration"
            assert "GMI_API_KEY" in error.message
        else:  # pragma: no cover
            raise AssertionError("Blank GMI credentials should fail.")


def test_blank_alibaba_primary_uses_non_blank_alternative() -> None:
    selection = default_selection(config(), ProviderCapability.STORYBOARD)
    validate_selection(
        config(
            dashscope_api_key=SecretStr(""),
            alibaba_api_key=SecretStr("valid-key"),
        ),
        selection,
    )


def test_blank_alibaba_alternatives_report_combined_requirement() -> None:
    selection = default_selection(config(), ProviderCapability.STORYBOARD)
    try:
        validate_selection(
            config(
                dashscope_api_key=SecretStr(" "),
                alibaba_api_key=SecretStr("   "),
            ),
            selection,
        )
    except ProviderError as error:
        assert error.code == "missing_configuration"
        assert "DASHSCOPE_API_KEY or ALIBABA_API_KEY" in error.message
    else:  # pragma: no cover
        raise AssertionError("Blank Alibaba credentials should fail.")


def test_media_provider_construction_uses_capability_registry(monkeypatch) -> None:
    sentinel = object()
    selection = default_selection(config(), ProviderCapability.IMAGE)
    calls: list[ProviderSelection] = []

    def construct(_config: AppConfig, selected: ProviderSelection):
        calls.append(selected)
        return media_registry.MediaProviderAdapter(  # type: ignore[arg-type]
            provider=sentinel
        )

    monkeypatch.setitem(
        media_registry._MEDIA_ADAPTER_CONSTRUCTORS,  # noqa: SLF001
        (ProviderCapability.IMAGE, "gmicloud"),
        construct,
    )
    assert media_registry.create_media_adapter(config(), selection).provider is sentinel
    assert calls == [selection]


def test_media_catalog_and_adapter_registry_match() -> None:
    catalog_entries = {
        key
        for key, entry in provider_catalog._CATALOG.items()  # noqa: SLF001
        if entry.adapter_kind == "genblaze"
    }
    adapter_entries = set(
        media_registry._MEDIA_ADAPTER_CONSTRUCTORS  # noqa: SLF001
    )
    assert catalog_entries == adapter_entries


def test_media_registry_rejects_non_media_and_unknown_combinations() -> None:
    selections = (
        ProviderSelection(
            capability="storyboard", provider="alibaba", model="qwen-plus"
        ),
        ProviderSelection(
            capability="video", provider="unregistered", model="video-v1"
        ),
    )
    for selection in selections:
        try:
            media_registry.create_media_adapter(config(), selection)
        except ProviderError as error:
            assert error.code == "unsupported_parameters"
            assert not error.retryable
        else:  # pragma: no cover
            raise AssertionError("Unsupported media selection should fail.")


def test_capability_specific_adapter_rejects_wrong_selection() -> None:
    image_selection = default_selection(config(), ProviderCapability.IMAGE)
    try:
        create_gmicloud_audio_adapter(config(), image_selection)
    except ProviderError as error:
        assert error.code == "unsupported_parameters"
        assert not error.retryable
    else:  # pragma: no cover
        raise AssertionError("Audio adapter must reject image capability.")


def test_gmicloud_video_adapter_owns_signed_url_handoff_and_lineage() -> None:
    selection = default_selection(config(), ProviderCapability.VIDEO)
    adapter = create_gmicloud_video_adapter(config(), selection)
    image_result = SimpleNamespace()
    signed_url = "https://signed.example.invalid/keyframe"

    assert adapter.video_inputs(
        image_result=image_result,  # type: ignore[arg-type]
        signed_image_url=signed_url,
    ) == {"image": signed_url}
    assert adapter.inherit_parent_result is True


def test_audio_artifacts_keep_selected_provider_and_model() -> None:
    class Storage:
        def sink(self, _prefix: str) -> object:
            return object()

        def key_from_url(self, _url: str, *, expected_prefix: str) -> str:
            return f"{expected_prefix}/audio.mp3"

    class CompletedPipeline:
        def run(self, *, sink: object, timeout: int):
            assert sink is not None
            assert timeout == 600
            asset = SimpleNamespace(
                url="s3://bucket/audio.mp3",
                sha256="a" * 64,
                media_type="audio/mpeg",
                size_bytes=128,
            )
            return SimpleNamespace(
                run=SimpleNamespace(
                    steps=[SimpleNamespace(assets=[asset])]
                ),
                manifest=SimpleNamespace(
                    manifest_uri="s3://bucket/manifest.json"
                ),
            )

    gateway = GenblazeRenderMediaGateway(
        config(), storage=Storage()  # type: ignore[arg-type]
    )
    for capability, provider, model in (
        (ProviderCapability.TTS, "future-voice", "voice-v2"),
        (ProviderCapability.MUSIC, "future-music", "music-v3"),
    ):
        selection = ProviderSelection(
            capability=capability,
            provider=provider,
            model=model,
        )
        artifact = gateway._run_audio(  # noqa: SLF001
            CompletedPipeline(),  # type: ignore[arg-type]
            prefix="talemotion/projects/project/audio",
            selection=selection,
        )
        assert (artifact.provider, artifact.model) == (provider, model)


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
