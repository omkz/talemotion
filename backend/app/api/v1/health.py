from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel
from redis import Redis
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.api.dependencies import DatabaseSession
from app.core.config import settings
from app.core.errors import ApiError

router = APIRouter(tags=["Health"])


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    version: str


@router.get("/health", response_model=HealthResponse)
async def get_health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service=settings.app_name,
        version=settings.app_version,
    )


class DependencyHealthResponse(BaseModel):
    status: Literal["ok", "unavailable"]
    dependencies: dict[str, Literal["ok", "unavailable"]]


@router.get(
    "/health/dependencies",
    response_model=DependencyHealthResponse,
    summary="Check PostgreSQL and Redis connectivity",
)
def get_dependency_health(
    session: DatabaseSession,
) -> DependencyHealthResponse:
    dependency_status: dict[str, Literal["ok", "unavailable"]] = {
        "database": "unavailable",
        "redis": "unavailable",
    }
    try:
        session.execute(text("SELECT 1"))
        dependency_status["database"] = "ok"
    except SQLAlchemyError:
        session.rollback()
    try:
        client = Redis.from_url(settings.redis_url, socket_connect_timeout=1)
        client.ping()
        dependency_status["redis"] = "ok"
        client.close()
    except Exception:
        dependency_status["redis"] = "unavailable"
    healthy = all(value == "ok" for value in dependency_status.values())
    if not healthy:
        raise ApiError(
            status_code=503,
            code="dependency_unavailable",
            message="A required backend dependency is unavailable.",
            details=dependency_status,
        )
    return DependencyHealthResponse(
        status="ok" if healthy else "unavailable",
        dependencies=dependency_status,
    )


class IntegrationHealthResponse(BaseModel):
    status: Literal["ok"]
    integrations: dict[str, bool]


@router.get(
    "/health/integrations",
    response_model=IntegrationHealthResponse,
    summary="Report whether media integrations are configured",
)
def get_integration_health() -> IntegrationHealthResponse:
    missing = set(settings.missing_media_configuration())
    return IntegrationHealthResponse(
        status="ok",
        integrations={
            "b2_configured": not bool(
                missing
                & {
                    "B2_REGION",
                    "B2_BUCKET_NAME",
                    "B2_KEY_ID",
                    "B2_APPLICATION_KEY",
                }
            ),
            "gmicloud_configured": "GMI_API_KEY" not in missing,
        },
    )
