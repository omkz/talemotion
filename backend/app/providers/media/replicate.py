from genblaze_replicate import ReplicateProvider

from app.core.config import AppConfig
from app.providers import ProviderCapability, ProviderError, ProviderSelection
from app.providers.catalog import provider_entry
from app.providers.media.adapter import MediaProviderAdapter


def create_replicate_image_adapter(
    config: AppConfig,
    selection: ProviderSelection,
) -> MediaProviderAdapter:
    _require_selection(selection)
    token = provider_entry(
        selection.capability, selection.provider
    ).credential(config)
    return MediaProviderAdapter(provider=ReplicateProvider(api_token=token))


def _require_selection(selection: ProviderSelection) -> None:
    if (
        selection.capability is not ProviderCapability.IMAGE
        or selection.provider != "replicate"
    ):
        raise ProviderError(
            code="unsupported_parameters",
            message=(
                "The Replicate adapter supports only the 'replicate' "
                "image provider selection."
            ),
            retryable=False,
        )
