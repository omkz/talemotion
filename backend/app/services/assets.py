from app.core.errors import ApiError
from app.models.asset import Asset, AssetStatus
from app.repositories.sqlalchemy import AssetRepository


class AssetService:
    def __init__(self, repository: AssetRepository) -> None:
        self.repository = repository

    def get(self, asset_id: str) -> Asset:
        asset = self.repository.get(asset_id)
        if asset is None:
            raise ApiError(
                status_code=404,
                code="asset_not_found",
                message="Asset not found.",
                details={"asset_id": asset_id},
            )
        return asset

    def previewable(self, asset_id: str) -> Asset:
        asset = self.get(asset_id)
        if (
            asset.status is not AssetStatus.AVAILABLE
            or not asset.storage_object_key
            or not asset.storage_object_key.startswith("talemotion/projects/")
        ):
            raise ApiError(
                status_code=409,
                code="state_conflict",
                message="This asset is not available for preview.",
                details={"asset_id": asset_id},
            )
        return asset
