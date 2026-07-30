from datetime import UTC, datetime, timedelta

from fastapi import APIRouter

from app.api.dependencies import DatabaseSession
from app.core.config import settings
from app.core.errors import ApiError
from app.media.genblaze_scene import GenblazeSceneGenerator
from app.repositories.sqlalchemy import AssetRepository
from app.schemas.asset import AssetResponse, asset_to_response
from app.schemas.common import ErrorResponse
from app.schemas.scene_generation import SignedPreviewUrlResponse
from app.services.assets import AssetService

router = APIRouter(prefix="/assets", tags=["Assets"])
ERROR_RESPONSES = {
    404: {"model": ErrorResponse},
    409: {"model": ErrorResponse},
    502: {"model": ErrorResponse},
}


def _assets(session: DatabaseSession) -> AssetService:
    return AssetService(AssetRepository(session))


@router.get(
    "/{asset_id}",
    response_model=AssetResponse,
    responses=ERROR_RESPONSES,
    summary="Get persisted generated-asset metadata",
)
def get_asset(asset_id: str, session: DatabaseSession) -> AssetResponse:
    return asset_to_response(_assets(session).get(asset_id))


@router.post(
    "/{asset_id}/preview-url",
    response_model=SignedPreviewUrlResponse,
    responses=ERROR_RESPONSES,
    summary="Create a short-lived Backblaze B2 preview URL",
)
def create_preview_url(
    asset_id: str,
    session: DatabaseSession,
) -> SignedPreviewUrlResponse:
    asset = _assets(session).previewable(asset_id)
    try:
        url = GenblazeSceneGenerator(settings).presign_preview(
            asset.storage_object_key or ""
        )
    except Exception as error:
        raise ApiError(
            status_code=502,
            code="storage_failed",
            message="The media preview is temporarily unavailable.",
            details={"asset_id": asset_id},
        ) from error
    expires_at = datetime.now(UTC) + timedelta(
        seconds=settings.media_preview_ttl_seconds
    )
    return SignedPreviewUrlResponse(
        url=url,
        expires_at=expires_at.isoformat(),
    )
