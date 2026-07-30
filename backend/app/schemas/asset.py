from datetime import datetime

from app.models.asset import Asset, AssetStatus, AssetType
from app.schemas.common import StrictSchema


class AssetResponse(StrictSchema):
    id: str
    project_id: str
    scene_id: str | None
    parent_asset_id: str | None
    type: AssetType
    status: AssetStatus
    version: int
    provider: str | None
    model_name: str | None
    prompt: str | None
    generation_parameters: dict[str, object]
    storage_bucket: str | None
    storage_object_key: str | None
    mime_type: str | None
    file_size_bytes: int | None
    sha256: str | None
    provenance_object_key: str | None
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


def asset_to_response(asset: Asset) -> AssetResponse:
    return AssetResponse.model_validate(asset, from_attributes=True)
