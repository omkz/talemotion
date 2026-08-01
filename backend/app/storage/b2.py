import hashlib
from dataclasses import dataclass
from urllib.parse import unquote, urlparse

from genblaze_core import KeyStrategy, ObjectStorageSink
from genblaze_core.exceptions import SinkError
from genblaze_core.storage.errors import StorageError
from genblaze_s3 import S3StorageBackend

from app.core.config import AppConfig
from app.providers.errors import ProviderError

TALEMOTION_STORAGE_PREFIX = "talemotion/"


@dataclass(frozen=True, slots=True)
class StoredObject:
    storage_object_key: str
    media_type: str
    file_size_bytes: int
    sha256: str


class B2MediaStorageGateway:
    """Backblaze B2 operations independent from AI provider selection."""

    def __init__(self, config: AppConfig) -> None:
        self.config = config

    def presign_preview(self, key: str) -> str:
        self._validate_key(key)
        backend = self._backend()
        try:
            return backend.get_url(
                key,
                expires_in=self.config.media_preview_ttl_seconds,
            )
        except (StorageError, OSError) as error:
            raise self._storage_error(
                "The media preview URL could not be created."
            ) from error
        finally:
            backend.close()

    def download(self, key: str) -> bytes:
        self._validate_key(key)
        backend = self._backend()
        try:
            return backend.get(key)
        except (StorageError, OSError) as error:
            raise self._storage_error(
                "A required media object could not be downloaded."
            ) from error
        finally:
            backend.close()

    def upload(
        self,
        *,
        key: str,
        data: bytes,
        media_type: str,
    ) -> StoredObject:
        self._validate_key(key)
        backend = self._backend()
        try:
            backend.put(key, data, content_type=media_type)
        except (StorageError, OSError) as error:
            raise self._storage_error(
                "The media object could not be uploaded."
            ) from error
        finally:
            backend.close()
        return StoredObject(
            storage_object_key=key,
            media_type=media_type,
            file_size_bytes=len(data),
            sha256=hashlib.sha256(data).hexdigest(),
        )

    def validate_configuration(self) -> None:
        missing = self.config.missing_storage_configuration()
        if missing:
            raise ProviderError(
                code="missing_configuration",
                message="Backblaze B2 storage is not configured. "
                f"Missing: {', '.join(missing)}.",
                retryable=False,
            )

    def sink(self, prefix: str) -> ObjectStorageSink:
        self._validate_key(prefix)
        return ObjectStorageSink(
            self._backend(),
            prefix=prefix,
            key_strategy=KeyStrategy.HIERARCHICAL,
        )

    def key_from_url(self, url: str, *, expected_prefix: str) -> str:
        self._validate_key(expected_prefix)
        path = unquote(urlparse(url).path).lstrip("/")
        bucket = self.config.b2_bucket_name or ""
        if bucket and path.startswith(f"{bucket}/"):
            path = path[len(bucket) + 1 :]
        prefix_at = path.find(f"{expected_prefix}/")
        if prefix_at >= 0:
            path = path[prefix_at:]
        if not path.startswith(f"{expected_prefix}/"):
            raise ProviderError(
                code="storage_failed",
                message="The stored object is outside its TaleMotion prefix.",
                retryable=False,
            )
        return path

    def map_error(self, error: Exception) -> ProviderError | None:
        if isinstance(error, (StorageError, SinkError, OSError)):
            return self._storage_error(
                "The media object could not be persisted in Backblaze B2."
            )
        return None

    def _backend(self) -> S3StorageBackend:
        self.validate_configuration()
        return S3StorageBackend.for_backblaze(
            self.config.b2_bucket_name or "",
            region=self.config.b2_region or "",
            key_id=self.config.b2_key_id.get_secret_value()
            if self.config.b2_key_id
            else "",
            app_key=self.config.b2_application_key.get_secret_value()
            if self.config.b2_application_key
            else "",
            auto_lifecycle=False,
        )

    @staticmethod
    def _validate_key(key: str) -> None:
        if not key.startswith(TALEMOTION_STORAGE_PREFIX):
            raise ProviderError(
                code="storage_failed",
                message="The media object key is outside the TaleMotion prefix.",
                retryable=False,
            )
        segments = key.split("/")
        if any(segment in {".", ".."} for segment in segments):
            raise ProviderError(
                code="storage_failed",
                message="The media object key is invalid.",
                retryable=False,
            )

    @staticmethod
    def _storage_error(message: str) -> ProviderError:
        return ProviderError(
            code="storage_failed",
            message=message,
            retryable=True,
        )
