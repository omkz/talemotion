from app.core.config import AppConfig
from app.storage.b2 import B2MediaStorageGateway
from app.storage.base import MediaStorageGateway
from app.storage.local import LocalMediaStorageGateway


def create_media_storage(config: AppConfig) -> MediaStorageGateway:
    if config.talemotion_storage_provider == "local":
        return LocalMediaStorageGateway(config)
    return B2MediaStorageGateway(config)
