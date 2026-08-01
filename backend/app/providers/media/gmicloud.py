from dataclasses import replace

from genblaze_gmicloud import (
    GMICloudAudioProvider,
    GMICloudImageProvider,
    GMICloudVideoProvider,
)

from app.core.config import AppConfig
from app.providers import ProviderSelection
from app.providers.catalog import provider_entry
from app.providers.media.adapter import MediaProviderAdapter


def create_gmicloud_image_adapter(
    config: AppConfig, selection: ProviderSelection
) -> MediaProviderAdapter:
    return MediaProviderAdapter(
        provider=GMICloudImageProvider(api_key=_credential(config, selection))
    )


def create_gmicloud_video_adapter(
    config: AppConfig, selection: ProviderSelection
) -> MediaProviderAdapter:
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
    return MediaProviderAdapter(
        provider=GMICloudVideoProvider(
            api_key=_credential(config, selection),
            models=registry,
        ),
        inherit_parent_result=True,
        video_input_factory=_signed_url_video_inputs,
    )


def create_gmicloud_audio_adapter(
    config: AppConfig, selection: ProviderSelection
) -> MediaProviderAdapter:
    return MediaProviderAdapter(
        provider=GMICloudAudioProvider(api_key=_credential(config, selection))
    )


def _signed_url_video_inputs(
    _image_result: object, signed_image_url: str
) -> dict[str, object]:
    return {"image": signed_image_url}


def _credential(config: AppConfig, selection: ProviderSelection) -> str:
    return provider_entry(
        selection.capability, selection.provider
    ).credential(config)
