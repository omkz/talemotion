from collections.abc import Callable

from app.core.config import AppConfig
from app.providers import ProviderCapability, ProviderSelection
from app.providers.catalog import provider_entry
from app.providers.errors import ProviderError
from app.providers.media.adapter import MediaProviderAdapter
from app.providers.media.gmicloud import (
    create_gmicloud_audio_adapter,
    create_gmicloud_image_adapter,
    create_gmicloud_video_adapter,
)
from app.providers.media.replicate import (
    create_replicate_image_adapter,
    create_replicate_video_adapter,
)

MediaAdapterConstructor = Callable[
    [AppConfig, ProviderSelection], MediaProviderAdapter
]

_MEDIA_ADAPTER_CONSTRUCTORS: dict[
    tuple[ProviderCapability, str], MediaAdapterConstructor
] = {
    (ProviderCapability.IMAGE, "gmicloud"): create_gmicloud_image_adapter,
    (ProviderCapability.IMAGE, "replicate"): create_replicate_image_adapter,
    (ProviderCapability.VIDEO, "gmicloud"): create_gmicloud_video_adapter,
    (ProviderCapability.VIDEO, "replicate"): create_replicate_video_adapter,
    (ProviderCapability.TTS, "gmicloud"): create_gmicloud_audio_adapter,
    (ProviderCapability.MUSIC, "gmicloud"): create_gmicloud_audio_adapter,
}


def create_media_adapter(
    config: AppConfig, selection: ProviderSelection
) -> MediaProviderAdapter:
    entry = provider_entry(selection.capability, selection.provider)
    if entry.adapter_kind != "genblaze":
        raise ProviderError(
            "unsupported_parameters",
            "The selected provider is not a Genblaze media provider.",
            False,
        )
    constructor = _MEDIA_ADAPTER_CONSTRUCTORS.get(
        (selection.capability, selection.provider)
    )
    if constructor is None:
        raise ProviderError(
            "unsupported_parameters",
            "The selected media provider adapter is not registered.",
            False,
        )
    return constructor(config, selection)
