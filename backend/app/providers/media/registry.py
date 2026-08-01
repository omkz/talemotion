from collections.abc import Callable

from genblaze_core.providers import BaseProvider

from app.core.config import AppConfig
from app.providers import ProviderCapability, ProviderSelection
from app.providers.catalog import provider_entry
from app.providers.errors import ProviderError
from app.providers.media.gmicloud import (
    create_gmicloud_audio_provider,
    create_gmicloud_image_provider,
    create_gmicloud_video_provider,
)

MediaProviderConstructor = Callable[
    [AppConfig, ProviderSelection], BaseProvider
]

_MEDIA_PROVIDER_CONSTRUCTORS: dict[
    tuple[ProviderCapability, str], MediaProviderConstructor
] = {
    (ProviderCapability.IMAGE, "gmicloud"): create_gmicloud_image_provider,
    (ProviderCapability.VIDEO, "gmicloud"): create_gmicloud_video_provider,
    (ProviderCapability.TTS, "gmicloud"): create_gmicloud_audio_provider,
    (ProviderCapability.MUSIC, "gmicloud"): create_gmicloud_audio_provider,
}


def create_media_provider(
    config: AppConfig, selection: ProviderSelection
) -> BaseProvider:
    entry = provider_entry(selection.capability, selection.provider)
    if entry.adapter_kind != "genblaze":
        raise ProviderError(
            "unsupported_parameters",
            "The selected provider is not a Genblaze media provider.",
            False,
        )
    constructor = _MEDIA_PROVIDER_CONSTRUCTORS.get(
        (selection.capability, selection.provider)
    )
    if constructor is None:
        raise ProviderError(
            "unsupported_parameters",
            "The selected media provider adapter is not registered.",
            False,
        )
    return constructor(config, selection)
