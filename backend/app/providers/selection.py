from collections.abc import Iterable, Mapping
from typing import TYPE_CHECKING

from pydantic import ValidationError

from app.providers.capabilities import ProviderCapability, ProviderSelection
from app.providers.catalog import default_selection, provider_entry
from app.providers.errors import ProviderError

if TYPE_CHECKING:
    from app.core.config import AppConfig

PROVIDER_SELECTIONS_KEY = "provider_selections"


def serialize_selections(
    selections: Mapping[ProviderCapability, ProviderSelection],
) -> dict[str, dict[str, str]]:
    return {
        capability.value: selection.model_dump(mode="json")
        for capability, selection in selections.items()
    }


def payload_with_selections(
    payload: Mapping[str, object],
    selections: Mapping[ProviderCapability, ProviderSelection],
) -> dict[str, object]:
    return {
        **payload,
        PROVIDER_SELECTIONS_KEY: serialize_selections(selections),
    }


def configured_selections(
    config: "AppConfig", capabilities: Iterable[ProviderCapability]
) -> dict[ProviderCapability, ProviderSelection]:
    return {
        capability: default_selection(config, capability)
        for capability in capabilities
    }


def selections_from_payload(
    payload: Mapping[str, object],
    capabilities: Iterable[ProviderCapability],
    config: "AppConfig",
) -> tuple[dict[ProviderCapability, ProviderSelection], bool]:
    required = tuple(capabilities)
    raw = payload.get(PROVIDER_SELECTIONS_KEY)
    if raw is None:
        return configured_selections(config, required), True
    if not isinstance(raw, dict):
        raise ProviderError(
            "unsupported_parameters",
            "The job provider snapshot is invalid.",
            False,
        )
    resolved: dict[ProviderCapability, ProviderSelection] = {}
    try:
        for capability in required:
            value = raw.get(capability.value)
            if value is None:
                raise ProviderError(
                    "unsupported_parameters",
                    f"The job provider snapshot is missing {capability.value}.",
                    False,
                )
            selection = ProviderSelection.model_validate(value)
            if selection.capability is not capability:
                raise ProviderError(
                    "unsupported_parameters",
                    "The job provider snapshot capability does not match its key.",
                    False,
                )
            provider_entry(capability, selection.provider)
            resolved[capability] = selection
    except ValidationError as error:
        raise ProviderError(
            "unsupported_parameters",
            "The job provider snapshot is invalid.",
            False,
        ) from error
    return resolved, False
