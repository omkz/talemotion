from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, ValidationInfo, field_validator


class ProviderCapability(StrEnum):
    STORYBOARD = "storyboard"
    IMAGE = "image"
    VIDEO = "video"
    TTS = "tts"
    MUSIC = "music"


class ProviderSelection(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    capability: ProviderCapability
    provider: str
    model: str

    @field_validator("provider", "model")
    @classmethod
    def normalize_names(cls, value: str, info: ValidationInfo) -> str:
        normalized = value.strip()
        return normalized.lower() if info.field_name == "provider" else normalized


class ModelCapabilities(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    supported_aspect_ratios: frozenset[str] | None = None
    supported_durations: frozenset[int] | None = None
    supports_structured_output: bool = False
    supports_text_to_image: bool = False
    supports_image_to_video: bool = False
    supports_tts: bool = False
    supports_music: bool = False
    image_handoff: Literal[
        "external_input", "image_kwarg", "signed_url"
    ] | None = None
