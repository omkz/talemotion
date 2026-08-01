from dataclasses import replace

from genblaze_core.providers import BaseProvider
from genblaze_gmicloud import (
    GMICloudAudioProvider,
    GMICloudImageProvider,
    GMICloudVideoProvider,
)

from app.core.config import AppConfig
from app.providers import ProviderSelection
from app.providers.catalog import provider_entry


def create_gmicloud_image_provider(
    config: AppConfig, selection: ProviderSelection
) -> BaseProvider:
    return GMICloudImageProvider(api_key=_credential(config, selection))


def create_gmicloud_video_provider(
    config: AppConfig, selection: ProviderSelection
) -> BaseProvider:
    registry = GMICloudVideoProvider.models_default().fork()
    if selection.model.startswith("wan") and selection.model.endswith("-i2v"):
        base = registry.get(selection.model)
        registry.register(
            replace(
                base,
                model_id=selection.model,
                param_aliases={**base.param_aliases, "image": "img_url"},
            )
        )
    return GMICloudVideoProvider(
        api_key=_credential(config, selection),
        models=registry,
    )


def create_gmicloud_audio_provider(
    config: AppConfig, selection: ProviderSelection
) -> BaseProvider:
    return GMICloudAudioProvider(api_key=_credential(config, selection))


def _credential(config: AppConfig, selection: ProviderSelection) -> str:
    return provider_entry(
        selection.capability, selection.provider
    ).credential(config)
