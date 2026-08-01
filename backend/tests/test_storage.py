from pydantic import SecretStr

from app.core.config import AppConfig
from app.providers import ProviderError
from app.storage import B2MediaStorageGateway
from app.storage import b2 as b2_module


def storage_config() -> AppConfig:
    return AppConfig(
        database_url="postgresql+psycopg://test:test@localhost/test",
        redis_url="redis://localhost:6379/15",
        celery_broker_url="redis://localhost:6379/15",
        b2_region="test-region",
        b2_bucket_name="test-bucket",
        b2_key_id=SecretStr("test-key"),
        b2_application_key=SecretStr("test-application-key"),
        talemotion_image_provider="unsupported-ai-provider",
        talemotion_video_provider="unsupported-ai-provider",
        _env_file=None,
    )


def test_storage_operations_do_not_resolve_ai_providers(monkeypatch) -> None:
    class Backend:
        def __init__(self) -> None:
            self.closed = False
            self.puts: list[tuple[str, bytes, str]] = []

        def get_url(self, key: str, *, expires_in: int) -> str:
            assert expires_in == 900
            return f"https://signed.example.invalid/{key}"

        def get(self, key: str) -> bytes:
            return f"bytes:{key}".encode()

        def put(self, key: str, data: bytes, *, content_type: str) -> None:
            self.puts.append((key, data, content_type))

        def close(self) -> None:
            self.closed = True

    backends: list[Backend] = []

    def backend_factory(*_args, **_kwargs):
        backend = Backend()
        backends.append(backend)
        return backend

    monkeypatch.setattr(
        b2_module.S3StorageBackend,
        "for_backblaze",
        backend_factory,
    )
    gateway = B2MediaStorageGateway(storage_config())
    key = "talemotion/projects/project/assets/image.png"

    assert gateway.presign_preview(key).endswith(key)
    assert gateway.download(key) == f"bytes:{key}".encode()
    stored = gateway.upload(key=key, data=b"asset", media_type="image/png")
    assert stored.storage_object_key == key
    assert stored.file_size_bytes == 5
    assert len(stored.sha256) == 64
    assert all(backend.closed for backend in backends)


def test_storage_rejects_keys_outside_talemotion_prefix() -> None:
    gateway = B2MediaStorageGateway(storage_config())
    try:
        gateway.presign_preview("../foreign/object.mp4")
    except ProviderError as error:
        assert error.code == "storage_failed"
        assert not error.retryable
    else:  # pragma: no cover
        raise AssertionError("An external storage key must be rejected.")
