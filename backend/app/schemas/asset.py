from datetime import datetime
from typing import Literal

from app.models.asset import Asset, AssetStatus, AssetType
from app.schemas.common import StrictSchema


class AssetResponse(StrictSchema):
    id: str
    project_id: str
    project_title: str
    chapter_id: str | None
    scene_id: str | None
    scene_title: str | None
    name: str
    type: AssetType
    status: AssetStatus
    version: int
    mime_type: str
    width: int | None
    height: int | None
    duration_seconds: float | None
    file_size_bytes: int
    preview_url: str | None
    download_url: str | None
    url_expires_at: datetime | None
    storage_key: str
    bucket_display_name: str
    storage_state: Literal["stored", "uploading", "unavailable", "archived"]
    provider: str | None
    model: str | None
    orchestration: Literal["genblaze"] = "genblaze"
    storage_provider: Literal["backblaze_b2"] = "backblaze_b2"
    manifest_status: Literal["recorded", "verified", "pending", "unavailable"]
    sha256: str | None
    generation_stage: str
    prompt_saved: bool
    created_at: datetime
    updated_at: datetime


class AssetListResponse(StrictSchema):
    items: list[AssetResponse]
    next_cursor: str | None
    has_more: bool
    total: int


class SignedAssetUrlResponse(StrictSchema):
    url: str
    expires_at: datetime


def asset_to_response(
    asset: Asset,
    *,
    preview_url: str | None = None,
    download_url: str | None = None,
    expires_at: datetime | None = None,
) -> AssetResponse:
    scene = asset.scene
    project = asset.project
    if asset.status is AssetStatus.ARCHIVED:
        storage_state = "archived"
    elif asset.status is AssetStatus.GENERATING:
        storage_state = "uploading"
    elif asset.status is AssetStatus.FAILED:
        storage_state = "unavailable"
    else:
        storage_state = "stored"
    return AssetResponse(
        id=asset.id,
        project_id=asset.project_id,
        project_title=project.title,
        chapter_id=scene.chapter_id if scene else None,
        scene_id=asset.scene_id,
        scene_title=scene.title if scene else None,
        name=asset.b2_object_key.rsplit("/", maxsplit=1)[-1],
        type=asset.type,
        status=asset.status,
        version=asset.version,
        mime_type=asset.mime_type,
        width=None,
        height=None,
        duration_seconds=None,
        file_size_bytes=asset.file_size_bytes,
        preview_url=preview_url,
        download_url=download_url,
        url_expires_at=expires_at,
        storage_key=asset.b2_object_key,
        bucket_display_name=asset.b2_bucket,
        storage_state=storage_state,
        provider=asset.provider,
        model=asset.model,
        manifest_status=(
            "recorded" if asset.provenance_object_key else "unavailable"
        ),
        sha256=asset.sha256,
        generation_stage=(
            "completed" if asset.status is AssetStatus.READY else asset.status
        ),
        prompt_saved=asset.prompt is not None,
        created_at=asset.created_at,
        updated_at=asset.created_at,
    )
