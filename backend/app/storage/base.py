import hashlib
from dataclasses import dataclass
from typing import Protocol

from genblaze_core import ObjectStorageSink
from genblaze_core.exceptions import SinkError
from genblaze_core.storage.errors import StorageError

from app.providers.errors import ProviderError

TALEMOTION_STORAGE_PREFIX = "talemotion/"


@dataclass(frozen=True, slots=True)
class StoredObject:
    storage_object_key: str
    media_type: str
    file_size_bytes: int
    sha256: str

    @classmethod
    def from_bytes(
        cls,
        *,
        key: str,
        data: bytes,
        media_type: str,
    ) -> "StoredObject":
        return cls(
            storage_object_key=key,
            media_type=media_type,
            file_size_bytes=len(data),
            sha256=hashlib.sha256(data).hexdigest(),
        )


class MediaStorageGateway(Protocol):
    def validate_configuration(self) -> None: ...

    def sink(self, prefix: str) -> ObjectStorageSink: ...

    def upload(
        self,
        *,
        key: str,
        data: bytes,
        media_type: str,
    ) -> StoredObject: ...

    def download(self, key: str) -> bytes: ...

    def presign_preview(self, key: str) -> str: ...

    def key_from_url(self, url: str, *, expected_prefix: str) -> str: ...

    def map_error(self, error: Exception) -> ProviderError | None: ...


def validate_storage_key(key: str) -> None:
    if (
        not key.startswith(TALEMOTION_STORAGE_PREFIX)
        or "\\" in key
        or "\x00" in key
    ):
        raise ProviderError(
            code="storage_failed",
            message="The media object key is outside the TaleMotion prefix.",
            retryable=False,
        )
    if any(not segment or segment in {".", ".."} for segment in key.split("/")):
        raise ProviderError(
            code="storage_failed",
            message="The media object key is invalid.",
            retryable=False,
        )


def validate_expected_prefix(key: str, expected_prefix: str) -> None:
    validate_storage_key(key)
    validate_storage_key(expected_prefix)
    if not key.startswith(f"{expected_prefix}/"):
        raise ProviderError(
            code="storage_failed",
            message="The stored object is outside its TaleMotion prefix.",
            retryable=False,
        )


def storage_error(message: str, *, retryable: bool = True) -> ProviderError:
    return ProviderError(
        code="storage_failed",
        message=message,
        retryable=retryable,
    )


def map_standard_storage_error(
    error: Exception,
    *,
    message: str,
) -> ProviderError | None:
    if isinstance(error, (StorageError, SinkError, OSError)):
        return storage_error(message)
    return None
