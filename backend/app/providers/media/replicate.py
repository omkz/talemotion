from genblaze_core import Asset
from genblaze_core.pipeline.result import PipelineResult
from genblaze_replicate import ReplicateProvider

from app.core.config import AppConfig
from app.providers import ProviderCapability, ProviderError, ProviderSelection
from app.providers.catalog import provider_entry
from app.providers.media.adapter import MediaProviderAdapter


def create_replicate_image_adapter(
    config: AppConfig,
    selection: ProviderSelection,
) -> MediaProviderAdapter:
    _require_selection(selection, ProviderCapability.IMAGE)
    token = provider_entry(
        selection.capability, selection.provider
    ).credential(config)
    return MediaProviderAdapter(provider=ReplicateProvider(api_token=token))


def create_replicate_video_adapter(
    config: AppConfig,
    selection: ProviderSelection,
) -> MediaProviderAdapter:
    _require_selection(selection, ProviderCapability.VIDEO)
    token = provider_entry(
        selection.capability, selection.provider
    ).credential(config)
    return MediaProviderAdapter(
        provider=ReplicateProvider(api_token=token),
        inherit_parent_result=True,
        video_input_factory=_replicate_video_inputs,
    )


def _replicate_video_inputs(
    _image_result: PipelineResult,
    signed_image_url: str,
) -> dict[str, object]:
    return {
        "external_inputs": [
            Asset(url=signed_image_url, media_type="image/png")
        ]
    }


def _require_selection(
    selection: ProviderSelection,
    capability: ProviderCapability,
) -> None:
    if (
        selection.capability is not capability
        or selection.provider != "replicate"
    ):
        raise ProviderError(
            code="unsupported_parameters",
            message=(
                "The Replicate adapter does not support the selected provider "
                f"and '{selection.capability.value}' capability combination."
            ),
            retryable=False,
        )
