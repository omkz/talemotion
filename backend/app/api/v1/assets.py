from base64 import urlsafe_b64decode, urlsafe_b64encode
from binascii import Error as Base64Error
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.dependencies import DatabaseSession, StorageDependency
from app.core.errors import ApiError
from app.models.asset import Asset, AssetStatus, AssetType
from app.repositories.sqlalchemy import AssetRepository
from app.schemas.asset import (
    AssetListResponse,
    AssetResponse,
    SignedAssetUrlResponse,
    asset_to_response,
)
from app.schemas.common import ErrorResponse

router = APIRouter(prefix="/assets", tags=["Assets"])


def _asset(repository: AssetRepository, asset_id: str) -> Asset:
    asset = repository.get(asset_id)
    if asset is None:
        raise ApiError(
            status_code=404,
            code="asset_not_found",
            message="Asset not found.",
            details={"asset_id": asset_id},
        )
    return asset


@router.get("", response_model=AssetListResponse, summary="List generated assets")
def list_assets(
    session: DatabaseSession,
    project_id: str | None = None,
    scene_id: str | None = None,
    asset_type: Annotated[AssetType | None, Query(alias="type")] = None,
    asset_status: Annotated[AssetStatus | None, Query(alias="status")] = None,
    search: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: str | None = None,
) -> AssetListResponse:
    items = AssetRepository(session).list(
        project_id=project_id,
        scene_id=scene_id,
        asset_type=asset_type,
        status=asset_status,
        search=search,
    )
    offset = 0
    if cursor:
        try:
            padded = cursor + "=" * (-len(cursor) % 4)
            namespace, raw_offset = urlsafe_b64decode(padded).decode().split(":", 1)
            if namespace != "assets":
                raise ValueError
            offset = int(raw_offset)
            if offset < 0 or offset > len(items):
                raise ValueError
        except (Base64Error, UnicodeDecodeError, ValueError):
            raise ApiError(
                status_code=400,
                code="validation_error",
                message="The asset cursor is invalid.",
                details={"cursor": cursor},
            ) from None
    page = items[offset : offset + limit]
    next_offset = offset + len(page)
    has_more = next_offset < len(items)
    next_cursor = (
        urlsafe_b64encode(f"assets:{next_offset}".encode()).decode().rstrip("=")
        if has_more
        else None
    )
    return AssetListResponse(
        items=[asset_to_response(asset) for asset in page],
        next_cursor=next_cursor,
        has_more=has_more,
        total=len(items),
    )


@router.get(
    "/{asset_id}",
    response_model=AssetResponse,
    summary="Get generated asset metadata",
    responses={404: {"model": ErrorResponse, "description": "Asset not found"}},
)
def get_asset(asset_id: str, session: DatabaseSession) -> AssetResponse:
    return asset_to_response(_asset(AssetRepository(session), asset_id))


@router.post(
    "/{asset_id}/preview-url",
    response_model=SignedAssetUrlResponse,
    summary="Create a short-lived B2 preview URL",
)
def create_preview_url(
    asset_id: str,
    session: DatabaseSession,
    storage: StorageDependency,
) -> SignedAssetUrlResponse:
    asset = _asset(AssetRepository(session), asset_id)
    url, expires_at = storage.signed_url(asset.b2_object_key)
    return SignedAssetUrlResponse(url=url, expires_at=expires_at)


@router.post(
    "/{asset_id}/download-url",
    response_model=SignedAssetUrlResponse,
    summary="Create a short-lived B2 download URL",
)
def create_download_url(
    asset_id: str,
    session: DatabaseSession,
    storage: StorageDependency,
) -> SignedAssetUrlResponse:
    asset = _asset(AssetRepository(session), asset_id)
    url, expires_at = storage.signed_url(asset.b2_object_key, download=True)
    return SignedAssetUrlResponse(url=url, expires_at=expires_at)
