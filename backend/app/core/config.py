from decimal import Decimal
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
    dashscope_api_key: SecretStr | None = None
    alibaba_api_key: SecretStr | None = None
    openai_api_key: SecretStr | None = None
    talemotion_storyboard_provider: str = "alibaba"
    talemotion_storyboard_model: str | None = "qwen-plus"
    talemotion_storyboard_max_attempts: int = 3
    talemotion_tts_provider: str | None = None
    talemotion_tts_model: str | None = None
    talemotion_tts_voice: str | None = None
    talemotion_music_provider: str | None = None
    talemotion_music_model: str | None = None
    talemotion_image_model: str = "seedream-5.0-lite"
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
        provider = self.talemotion_storyboard_provider.strip().lower()
        if provider not in {"alibaba", "openai"}:
            missing.append("TALEMOTION_STORYBOARD_PROVIDER (alibaba or openai)")
        if not self.talemotion_storyboard_model:
            missing.append("TALEMOTION_STORYBOARD_MODEL")
        if provider == "alibaba" and not (
            self.alibaba_api_key or self.dashscope_api_key
        ):
            missing.append("DASHSCOPE_API_KEY or ALIBABA_API_KEY")
        if provider == "openai" and not self.openai_api_key:
            missing.append("OPENAI_API_KEY")
        return missing

    def missing_storage_configuration(self) -> list[str]:
        configured = {
            "B2_REGION": self.b2_region,
            "B2_BUCKET_NAME": self.b2_bucket_name,
            "B2_KEY_ID": self.b2_key_id,
            "B2_APPLICATION_KEY": self.b2_application_key,
        }
        return [name for name, value in configured.items() if not value]

    def missing_tts_configuration(self) -> list[str]:
        missing = self.missing_storage_configuration()
        if self.talemotion_tts_provider != "gmicloud":
            missing.append("TALEMOTION_TTS_PROVIDER=gmicloud")
        if not self.talemotion_tts_model:
            missing.append("TALEMOTION_TTS_MODEL")
        if not self.gmi_api_key:
            missing.append("GMI_API_KEY")
        return missing

    def missing_music_configuration(self) -> list[str]:
        missing = self.missing_storage_configuration()
        if self.talemotion_music_provider != "gmicloud":
            missing.append("TALEMOTION_MUSIC_PROVIDER=gmicloud")
        if not self.talemotion_music_model:
            missing.append("TALEMOTION_MUSIC_MODEL")
        if not self.gmi_api_key:
            missing.append("GMI_API_KEY")
        return missing

settings = AppConfig()
