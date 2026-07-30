import shutil

from app.core.config import AppConfig
from app.core.errors import ApiError


def require_openai(config: AppConfig) -> None:
    if config.openai_api_key is None:
        raise ApiError(
            status_code=503,
            code="provider_not_configured",
            message="OPENAI_API_KEY is required for this generation workflow.",
            details={"provider": "openai", "orchestration": "genblaze"},
        )


def require_b2(config: AppConfig) -> None:
    missing = [
        name
        for name, value in (
            ("B2_ENDPOINT", config.b2_endpoint),
            ("B2_REGION", config.b2_region),
            ("B2_BUCKET", config.b2_bucket),
            ("B2_KEY_ID", config.b2_key_id),
            ("B2_APPLICATION_KEY", config.b2_application_key),
        )
        if value is None
    ]
    if missing:
        raise ApiError(
            status_code=503,
            code="storage_not_configured",
            message="Backblaze B2 configuration is incomplete.",
            details={"missing": ",".join(missing)},
        )


def require_ffmpeg(config: AppConfig) -> None:
    if shutil.which(config.ffmpeg_path) is None:
        raise ApiError(
            status_code=503,
            code="renderer_not_configured",
            message="FFmpeg is required for final rendering.",
            details={"ffmpeg_path": config.ffmpeg_path},
        )
