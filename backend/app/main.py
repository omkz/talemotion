from urllib.parse import urlparse

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.core.config import AppConfig, settings
from app.core.errors import RequestIdMiddleware, register_error_handlers
from app.providers.errors import ProviderError
from app.storage import create_media_storage


def create_app(config: AppConfig | None = None) -> FastAPI:
    configured = config or settings
    application = FastAPI(
        title="TaleMotion API",
        version=configured.app_version,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=configured.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.add_middleware(RequestIdMiddleware)

    application.include_router(api_router, prefix=configured.api_v1_prefix)
    register_error_handlers(application)

    if configured.talemotion_storage_provider == "local":
        storage = create_media_storage(configured)
        storage.validate_configuration()
        mount_path = urlparse(
            configured.talemotion_local_storage_base_url
        ).path.rstrip("/")
        if not mount_path or mount_path == "/":
            raise ProviderError(
                code="missing_configuration",
                message=(
                    "The local media storage base URL must include a route path."
                ),
                retryable=False,
            )
        application.mount(
            mount_path,
            StaticFiles(
                directory=(
                    configured.talemotion_local_storage_path.expanduser().resolve()
                ),
                check_dir=True,
            ),
            name="local-media",
        )
    return application


app = create_app()
