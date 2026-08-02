from decimal import Decimal
from pathlib import Path
from typing import TYPE_CHECKING, Literal

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

if TYPE_CHECKING:
    from app.providers import ProviderCapability, ProviderSelection


class AppConfig(BaseSettings):
    app_env: str = "development"
    app_name: str = "talemotion-backend"
    app_version: str = "0.1.0"
    api_v1_prefix: str = "/api/v1"
    cors_origins: str = "http://localhost:3000"
    database_url: str
    redis_url: str
    celery_broker_url: str

    b2_region: str | None = None
    b2_bucket_name: str | None = None
    b2_key_id: SecretStr | None = None
    b2_application_key: SecretStr | None = None
    gmi_api_key: SecretStr | None = None
    replicate_api_token: SecretStr | None = None
    dashscope_api_key: SecretStr | None = None
    dashscope_base_url: str | None = None
    alibaba_api_key: SecretStr | None = None
    openai_api_key: SecretStr | None = None
    talemotion_storage_provider: Literal["local", "b2"] = "local"
    talemotion_local_storage_path: Path = Path(".data/media")
    talemotion_local_storage_base_url: str = "http://localhost:8000/media"
    talemotion_storyboard_provider: str = "alibaba"
    talemotion_storyboard_model: str | None = "qwen-plus"
    talemotion_storyboard_max_attempts: int = 3
    talemotion_image_provider: str = "gmicloud"
    talemotion_video_provider: str = "gmicloud"
    talemotion_tts_provider: str = "gmicloud"
    talemotion_tts_model: str | None = None
    talemotion_tts_voice: str | None = None
    talemotion_music_provider: str = "gmicloud"
    talemotion_music_model: str | None = None
    talemotion_image_model: str | None = None
    talemotion_video_model: str = "wan2.6-i2v"
    talemotion_video_durations: str = "5"
    genblaze_cache_dir: Path = Path(".cache/genblaze")
    media_preview_ttl_seconds: int = 900
    ffmpeg_binary: str = "ffmpeg"
    ffmpeg_timeout_seconds: int = 900
    queued_job_timeout_seconds: int = 1800
    running_job_timeout_seconds: int = 7200
    session_cookie_name: str = "talemotion_session"
    csrf_cookie_name: str = "talemotion_csrf"
    session_ttl_days: int = 30
    session_cookie_secure: bool = False
    new_user_free_credits: Decimal = Decimal("100")
    credit_rate_storyboard_generation: Decimal = Decimal("5")
    credit_rate_image_generation: Decimal = Decimal("4")
    credit_rate_video_generation: Decimal = Decimal("8")
    credit_rate_tts_generation: Decimal = Decimal("2")
    credit_rate_music_generation: Decimal = Decimal("3")
    credit_rate_final_render: Decimal = Decimal("8")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("dashscope_base_url", mode="before")
    @classmethod
    def normalize_optional_url(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value

    @field_validator("talemotion_storage_provider", mode="before")
    @classmethod
    def normalize_storage_provider(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().lower()
        return value

    @field_validator("talemotion_local_storage_base_url")
    @classmethod
    def normalize_local_storage_base_url(cls, value: str) -> str:
        return value.strip().rstrip("/")

    @property
    def cors_origin_list(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.cors_origins.split(",")
            if origin.strip()
        ]

    @property
    def secure_session_cookie(self) -> bool:
        return self.session_cookie_secure or self.app_env == "production"

    @property
    def supported_video_durations(self) -> frozenset[int]:
        try:
            values = {
                int(value.strip())
                for value in self.talemotion_video_durations.split(",")
                if value.strip()
            }
        except ValueError:
            return frozenset()
        return frozenset(value for value in values if 1 <= value <= 60)

    def missing_media_configuration(self) -> list[str]:
        missing = self.missing_storage_configuration()
        missing.extend(self._missing_capability_configuration("image"))
        missing.extend(self._missing_capability_configuration("video"))
        return list(dict.fromkeys(missing))

    def missing_storyboard_configuration(self) -> list[str]:
        from app.providers import ProviderCapability
        from app.providers.catalog import (
            default_selection,
            missing_provider_configuration,
        )

        try:
            selection = default_selection(
                self, ProviderCapability.STORYBOARD
            )
        except Exception:
            return [
                "TALEMOTION_STORYBOARD_PROVIDER (alibaba or openai)",
                "TALEMOTION_STORYBOARD_MODEL",
            ]
        return missing_provider_configuration(self, selection)

    def missing_storage_configuration(self) -> list[str]:
        if self.talemotion_storage_provider == "local":
            return []
        return self.missing_b2_storage_configuration()

    def missing_b2_storage_configuration(self) -> list[str]:
        configured = {
            "B2_REGION": self.b2_region,
            "B2_BUCKET_NAME": self.b2_bucket_name,
            "B2_KEY_ID": self.b2_key_id,
            "B2_APPLICATION_KEY": self.b2_application_key,
        }
        return [
            name
            for name, value in configured.items()
            if not self._configured_text(value)
        ]

    @staticmethod
    def _configured_text(value: str | SecretStr | None) -> str | None:
        if isinstance(value, SecretStr):
            resolved = value.get_secret_value().strip()
        elif isinstance(value, str):
            resolved = value.strip()
        else:
            return None
        return resolved or None

    def missing_tts_configuration(self) -> list[str]:
        missing = self.missing_storage_configuration()
        missing.extend(self._missing_capability_configuration("tts"))
        return missing

    def missing_music_configuration(self) -> list[str]:
        missing = self.missing_storage_configuration()
        missing.extend(self._missing_capability_configuration("music"))
        return missing

    def default_provider_selection(
        self, capability: "ProviderCapability"
    ) -> "ProviderSelection":
        from app.providers.catalog import default_selection

        return default_selection(self, capability)

    def _missing_capability_configuration(self, capability_name: str) -> list[str]:
        from app.providers import ProviderCapability
        from app.providers.catalog import (
            default_selection,
            missing_provider_configuration,
        )

        capability = ProviderCapability(capability_name)
        try:
            selection = default_selection(self, capability)
        except Exception:
            return [
                f"TALEMOTION_{capability.value.upper()}_PROVIDER",
                f"TALEMOTION_{capability.value.upper()}_MODEL",
            ]
        return missing_provider_configuration(self, selection)

settings = AppConfig()
