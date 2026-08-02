import os
import tempfile
from pathlib import Path
from typing import Any, BinaryIO
from urllib.parse import quote, unquote, urlparse

from genblaze_core import KeyStrategy, ObjectStorageSink
from genblaze_core.storage.base import StorageBackend

from app.core.config import AppConfig
from app.providers.errors import ProviderError
from app.storage.base import (
    StoredObject,
    map_standard_storage_error,
    storage_error,
    validate_expected_prefix,
    validate_storage_key,
)


class LocalMediaStorageGateway:
    """Filesystem media storage for single-host development."""

    def __init__(self, config: AppConfig) -> None:
        self.root = config.talemotion_local_storage_path.expanduser().resolve()
        self.base_url = config.talemotion_local_storage_base_url

    def validate_configuration(self) -> None:
        if not self.base_url:
            raise ProviderError(
                code="missing_configuration",
                message="Local media storage base URL is not configured.",
                retryable=False,
            )
        try:
            self.root.mkdir(parents=True, exist_ok=True)
        except OSError as error:
            raise storage_error(
                "The local media storage directory is unavailable."
            ) from error

    def sink(self, prefix: str) -> ObjectStorageSink:
        validate_storage_key(prefix)
        return ObjectStorageSink(
            self._backend(),
            prefix=prefix,
            key_strategy=KeyStrategy.HIERARCHICAL,
        )

    def upload(
        self,
        *,
        key: str,
        data: bytes,
        media_type: str,
    ) -> StoredObject:
        backend = self._backend()
        try:
            backend.put(key, data, content_type=media_type)
        except OSError as error:
            raise storage_error(
                "The local media object could not be stored."
            ) from error
        finally:
            backend.close()
        return StoredObject.from_bytes(key=key, data=data, media_type=media_type)

    def download(self, key: str) -> bytes:
        backend = self._backend()
        try:
            return backend.get(key)
        except OSError as error:
            raise storage_error(
                "The local media object could not be read.",
                retryable=False,
            ) from error
        finally:
            backend.close()

    def presign_preview(self, key: str) -> str:
        backend = self._backend()
        try:
            return backend.get_url(key)
        finally:
            backend.close()

    def key_from_url(self, url: str, *, expected_prefix: str) -> str:
        validate_storage_key(expected_prefix)
        backend = self._backend()
        try:
            key = backend.key_from_url(url)
        finally:
            backend.close()
        if key is None:
            raise storage_error(
                "The stored object URL is not a TaleMotion local media URL.",
                retryable=False,
            )
        validate_expected_prefix(key, expected_prefix)
        return key

    def map_error(self, error: Exception) -> ProviderError | None:
        return map_standard_storage_error(
            error,
            message="The media object could not be persisted in local storage.",
        )

    def _backend(self) -> "LocalStorageBackend":
        self.validate_configuration()
        return LocalStorageBackend(self.root, self.base_url)


class LocalStorageBackend(StorageBackend):
    def __init__(self, root: Path, base_url: str) -> None:
        self.root = root
        self.base_url = base_url
        self._base_parts = urlparse(base_url)

    def put(
        self,
        key: str,
        data: bytes | BinaryIO,
        *,
        content_type: str | None = None,
        metadata: dict[str, str] | None = None,
        extra_args: dict[str, Any] | None = None,
    ) -> str:
        del content_type, metadata, extra_args
        payload = data if isinstance(data, bytes) else data.read()
        path = self._path_for_key(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(
                dir=path.parent,
                prefix=".talemotion-",
                delete=False,
            ) as temporary:
                temporary.write(payload)
                temporary.flush()
                os.fsync(temporary.fileno())
                temporary_path = Path(temporary.name)
            os.replace(temporary_path, path)
        finally:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)
        return key

    def get(self, key: str) -> bytes:
        return self._path_for_key(key).read_bytes()

    def exists(self, key: str) -> bool:
        return self._path_for_key(key).is_file()

    def delete(self, key: str) -> None:
        self._path_for_key(key).unlink(missing_ok=True)

    def get_url(self, key: str, *, expires_in: int = 3600) -> str:
        del expires_in
        return self.get_durable_url(key)

    def get_durable_url(self, key: str) -> str:
        validate_storage_key(key)
        return f"{self.base_url}/{quote(key, safe='/-_.~')}"

    def key_from_url(self, url: str) -> str | None:
        parsed = urlparse(url)
        if (
            parsed.scheme != self._base_parts.scheme
            or parsed.netloc != self._base_parts.netloc
        ):
            return None
        base_path = self._base_parts.path.rstrip("/")
        if not parsed.path.startswith(f"{base_path}/"):
            return None
        key = unquote(parsed.path[len(base_path) + 1 :])
        validate_storage_key(key)
        return key

    def _path_for_key(self, key: str) -> Path:
        validate_storage_key(key)
        path = self.root.joinpath(*key.split("/")).resolve(strict=False)
        if not path.is_relative_to(self.root):
            raise storage_error(
                "The local media object key is invalid.",
                retryable=False,
            )
        return path
