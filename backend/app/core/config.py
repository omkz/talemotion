from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    openai_api_key: SecretStr | None = None
    talemotion_storyboard_provider: str = "gmicloud"
    talemotion_storyboard_model: str | None = None
    talemotion_storyboard_max_attempts: int = 3
    talemotion_image_model: str = "seedream-5.0-lite"
    talemotion_video_model: str = "wan2.6-i2v"
    talemotion_video_durations: str = "5"
    genblaze_cache_dir: Path = Path(".cache/genblaze")
    media_preview_ttl_seconds: int = 900

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.cors_origins.split(",")
            if origin.strip()
        ]

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
        configured = {
            "B2_REGION": self.b2_region,
            "B2_BUCKET_NAME": self.b2_bucket_name,
            "B2_KEY_ID": self.b2_key_id,
            "B2_APPLICATION_KEY": self.b2_application_key,
            "GMI_API_KEY": self.gmi_api_key,
        }
        return [name for name, value in configured.items() if not value]

    def missing_storyboard_configuration(self) -> list[str]:
        missing: list[str] = []
        if self.talemotion_storyboard_provider != "gmicloud":
            missing.append("TALEMOTION_STORYBOARD_PROVIDER=gmicloud")
        if not self.talemotion_storyboard_model:
            missing.append("TALEMOTION_STORYBOARD_MODEL")
        if not self.gmi_api_key:
            missing.append("GMI_API_KEY")
        return missing

settings = AppConfig()
