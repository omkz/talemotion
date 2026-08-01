from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

from pydantic import SecretStr

from app.providers.capabilities import (
    ModelCapabilities,
    ProviderCapability,
    ProviderSelection,
)
from app.providers.errors import ProviderError, missing_configuration_error

if TYPE_CHECKING:
    from app.core.config import AppConfig


@dataclass(frozen=True, slots=True)
class CredentialOption:
    environment_name: str
    setting_name: str


@dataclass(frozen=True, slots=True)
class CredentialRequirement:
    alternatives: tuple[CredentialOption, ...]

    @property
    def label(self) -> str:
        return " or ".join(
            option.environment_name for option in self.alternatives
        )

    def configured_value(self, config: "AppConfig") -> str | None:
        for option in self.alternatives:
            value = getattr(config, option.setting_name, None)
            if isinstance(value, SecretStr):
                return value.get_secret_value()
            if isinstance(value, str) and value:
                return value
        return None


@dataclass(frozen=True, slots=True)
class ProviderEntry:
    capability: ProviderCapability
    provider: str
    default_model: str
    model_setting: str
    credential_requirements: tuple[CredentialRequirement, ...]
    adapter_kind: Literal["pydantic_ai", "genblaze"]
    capabilities: ModelCapabilities

    @property
    def required_configuration(self) -> tuple[str, ...]:
        return tuple(
            requirement.label for requirement in self.credential_requirements
        )

    def missing_configuration(self, config: "AppConfig") -> list[str]:
        return [
            requirement.label
            for requirement in self.credential_requirements
            if requirement.configured_value(config) is None
        ]

    def credential(self, config: "AppConfig", index: int = 0) -> str:
        requirement = self.credential_requirements[index]
        value = requirement.configured_value(config)
        if value is None:
            raise missing_configuration_error([requirement.label])
        return value


def _credential(*options: tuple[str, str]) -> CredentialRequirement:
    return CredentialRequirement(
        tuple(CredentialOption(*option) for option in options)
    )


_CATALOG: dict[tuple[ProviderCapability, str], ProviderEntry] = {
    (ProviderCapability.STORYBOARD, "alibaba"): ProviderEntry(
        ProviderCapability.STORYBOARD,
        "alibaba",
        "qwen-plus",
        "talemotion_storyboard_model",
        (
            _credential(
                ("DASHSCOPE_API_KEY", "dashscope_api_key"),
                ("ALIBABA_API_KEY", "alibaba_api_key"),
            ),
        ),
        "pydantic_ai",
        ModelCapabilities(supports_structured_output=True),
    ),
    (ProviderCapability.STORYBOARD, "openai"): ProviderEntry(
        ProviderCapability.STORYBOARD,
        "openai",
        "gpt-5-mini",
        "talemotion_storyboard_model",
        (_credential(("OPENAI_API_KEY", "openai_api_key")),),
        "pydantic_ai",
        ModelCapabilities(supports_structured_output=True),
    ),
    (ProviderCapability.IMAGE, "gmicloud"): ProviderEntry(
        ProviderCapability.IMAGE,
        "gmicloud",
        "seedream-5.0-lite",
        "talemotion_image_model",
        (_credential(("GMI_API_KEY", "gmi_api_key")),),
        "genblaze",
        ModelCapabilities(
            supported_aspect_ratios=frozenset({"9:16", "16:9"}),
            supports_text_to_image=True,
        ),
    ),
    (ProviderCapability.VIDEO, "gmicloud"): ProviderEntry(
        ProviderCapability.VIDEO,
        "gmicloud",
        "wan2.6-i2v",
        "talemotion_video_model",
        (_credential(("GMI_API_KEY", "gmi_api_key")),),
        "genblaze",
        ModelCapabilities(
            supported_aspect_ratios=frozenset({"9:16", "16:9"}),
            supported_durations=frozenset({5}),
            supports_image_to_video=True,
            image_handoff="signed_url",
        ),
    ),
    (ProviderCapability.TTS, "gmicloud"): ProviderEntry(
        ProviderCapability.TTS,
        "gmicloud",
        "",
        "talemotion_tts_model",
        (_credential(("GMI_API_KEY", "gmi_api_key")),),
        "genblaze",
        ModelCapabilities(supports_tts=True),
    ),
    (ProviderCapability.MUSIC, "gmicloud"): ProviderEntry(
        ProviderCapability.MUSIC,
        "gmicloud",
        "",
        "talemotion_music_model",
        (_credential(("GMI_API_KEY", "gmi_api_key")),),
        "genblaze",
        ModelCapabilities(supports_music=True),
    ),
}


def provider_entry(
    capability: ProviderCapability, provider: str
) -> ProviderEntry:
    normalized = provider.strip().lower()
    entry = _CATALOG.get((capability, normalized))
    if entry is None:
        raise ProviderError(
            code="unsupported_parameters",
            message=(
                f"Provider '{normalized or '<empty>'}' does not support "
                f"the '{capability.value}' capability."
            ),
            retryable=False,
        )
    return entry


def default_selection(
    config: "AppConfig", capability: ProviderCapability
) -> ProviderSelection:
    provider_value = getattr(config, f"talemotion_{capability.value}_provider")
    provider = (provider_value or "").strip().lower()
    entry = provider_entry(capability, provider)
    configured_model = getattr(config, entry.model_setting)
    model = (configured_model or entry.default_model).strip()
    return ProviderSelection(
        capability=capability,
        provider=entry.provider,
        model=model,
    )


def model_capabilities(
    config: "AppConfig", selection: ProviderSelection
) -> ModelCapabilities:
    entry = provider_entry(selection.capability, selection.provider)
    if selection.capability is ProviderCapability.VIDEO:
        return entry.capabilities.model_copy(
            update={"supported_durations": config.supported_video_durations}
        )
    return entry.capabilities


def missing_provider_configuration(
    config: "AppConfig", selection: ProviderSelection
) -> list[str]:
    entry = provider_entry(selection.capability, selection.provider)
    missing: list[str] = []
    if not selection.model.strip():
        missing.append(entry.model_setting.upper())
    missing.extend(entry.missing_configuration(config))
    return missing


def validate_selection(
    config: "AppConfig",
    selection: ProviderSelection,
    *,
    aspect_ratio: str | None = None,
    duration_seconds: int | None = None,
) -> None:
    capabilities = model_capabilities(config, selection)
    if (
        aspect_ratio is not None
        and capabilities.supported_aspect_ratios is not None
        and aspect_ratio not in capabilities.supported_aspect_ratios
    ):
        raise ProviderError(
            "unsupported_parameters",
            f"{selection.provider}:{selection.model} does not support "
            f"aspect ratio {aspect_ratio}.",
            False,
        )
    if (
        duration_seconds is not None
        and capabilities.supported_durations is not None
        and duration_seconds not in capabilities.supported_durations
    ):
        supported = sorted(capabilities.supported_durations)
        raise ProviderError(
            "unsupported_parameters",
            f"{selection.provider}:{selection.model} supports configured "
            f"durations: {supported} seconds.",
            False,
        )
    missing = missing_provider_configuration(config, selection)
    if missing:
        raise missing_configuration_error(missing)
