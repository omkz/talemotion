from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppConfig(BaseSettings):
    app_env: str = "development"
    app_name: str = "talemotion-backend"
    app_version: str = "0.1.0"
    cors_origins: str = "http://localhost:3000"
    database_url: str = (
        "postgresql+psycopg://talemotion:talemotion@localhost:5432/talemotion"
    )
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str | None = None
    celery_result_backend: str | None = None

    openai_api_key: SecretStr | None = None
    genblaze_text_model: str = "gpt-4o-mini"
    genblaze_image_model: str = "gpt-image-1"
    genblaze_tts_model: str = "gpt-4o-mini-tts"
    genblaze_tts_voice: str = "alloy"

    b2_endpoint: str | None = None
    b2_region: str | None = None
    b2_bucket: str | None = None
    b2_key_id: SecretStr | None = None
    b2_application_key: SecretStr | None = None
    signed_url_ttl_seconds: int = 900

    ffmpeg_path: str = "ffmpeg"
    media_work_dir: Path = Path("/tmp/talemotion-media")

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
    def broker_url(self) -> str:
        return self.celery_broker_url or self.redis_url

    @property
    def result_backend(self) -> str:
        return self.celery_result_backend or self.redis_url


settings = AppConfig()
