import hashlib
from pathlib import Path

import pytest
from genblaze_core.models import Asset
from pydantic import SecretStr, ValidationError

from app.core.config import AppConfig
from app.providers import ProviderError
from app.storage import (
    B2MediaStorageGateway,
    LocalMediaStorageGateway,
    create_media_storage,
)
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
        talemotion_storage_provider="b2",
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


def local_storage_config(root: Path, **overrides: object) -> AppConfig:
    values: dict[str, object] = {
        "database_url": "postgresql+psycopg://test:test@localhost/test",
        "redis_url": "redis://localhost:6379/15",
        "celery_broker_url": "redis://localhost:6379/15",
        "talemotion_storage_provider": "local",
        "talemotion_local_storage_path": root,
        "talemotion_local_storage_base_url": "http://testserver/media/",
        "_env_file": None,
    }
    values.update(overrides)
    return AppConfig(**values)


def test_storage_factory_selects_configured_provider(tmp_path: Path) -> None:
    assert isinstance(
        create_media_storage(local_storage_config(tmp_path)),
        LocalMediaStorageGateway,
    )
    assert isinstance(create_media_storage(storage_config()), B2MediaStorageGateway)


def test_storage_provider_and_local_url_are_normalized(tmp_path: Path) -> None:
    config = local_storage_config(
        tmp_path,
        talemotion_storage_provider=" LOCAL ",
        talemotion_local_storage_base_url=" http://testserver/media/// ",
    )

    assert config.talemotion_storage_provider == "local"
    assert config.talemotion_local_storage_base_url == "http://testserver/media"


def test_unsupported_storage_provider_fails_clearly(tmp_path: Path) -> None:
    with pytest.raises(ValidationError):
        local_storage_config(
            tmp_path,
            talemotion_storage_provider="unsupported",
        )


def test_storage_configuration_is_explicit(tmp_path: Path) -> None:
    local = local_storage_config(tmp_path, app_env="production")
    b2 = AppConfig(
        database_url="postgresql+psycopg://test:test@localhost/test",
        redis_url="redis://localhost:6379/15",
        celery_broker_url="redis://localhost:6379/15",
        app_env="development",
        talemotion_storage_provider="b2",
        _env_file=None,
    )

    assert local.missing_storage_configuration() == []
    assert b2.missing_storage_configuration() == [
        "B2_REGION",
        "B2_BUCKET_NAME",
        "B2_KEY_ID",
        "B2_APPLICATION_KEY",
    ]


def test_local_upload_download_preview_and_key_round_trip(
    tmp_path: Path,
) -> None:
    gateway = LocalMediaStorageGateway(local_storage_config(tmp_path))
    key = "talemotion/projects/project-1/assets/image.png"
    data = b"local media bytes"

    stored = gateway.upload(key=key, data=data, media_type="image/png")

    assert (tmp_path / key).read_bytes() == data
    assert stored.storage_object_key == key
    assert stored.media_type == "image/png"
    assert stored.file_size_bytes == len(data)
    assert stored.sha256 == hashlib.sha256(data).hexdigest()
    assert gateway.download(key) == data
    preview = gateway.presign_preview(key)
    assert preview == f"http://testserver/media/{key}"
    assert gateway.key_from_url(
        preview,
        expected_prefix="talemotion/projects/project-1",
    ) == key


@pytest.mark.parametrize(
    "key",
    [
        "foreign/object.png",
        "talemotion/../outside.png",
        "talemotion/./object.png",
        "talemotion/project\\object.png",
        "talemotion/project/invalid\x00.png",
    ],
)
def test_local_storage_rejects_unsafe_keys(
    tmp_path: Path,
    key: str,
) -> None:
    gateway = LocalMediaStorageGateway(local_storage_config(tmp_path))

    with pytest.raises(ProviderError) as raised:
        gateway.upload(key=key, data=b"unsafe", media_type="image/png")

    assert raised.value.code == "storage_failed"
    assert not raised.value.retryable


def test_local_storage_rejects_symlink_root_escape(tmp_path: Path) -> None:
    root = tmp_path / "root"
    outside = tmp_path / "outside"
    root.mkdir()
    outside.mkdir()
    (root / "talemotion").mkdir()
    (root / "talemotion" / "escape").symlink_to(outside, target_is_directory=True)
    gateway = LocalMediaStorageGateway(local_storage_config(root))

    with pytest.raises(ProviderError) as raised:
        gateway.upload(
            key="talemotion/escape/object.png",
            data=b"unsafe",
            media_type="image/png",
        )

    assert "invalid" in raised.value.message
    assert not (outside / "object.png").exists()


def test_local_storage_enforces_url_and_expected_prefix(tmp_path: Path) -> None:
    gateway = LocalMediaStorageGateway(local_storage_config(tmp_path))

    with pytest.raises(ProviderError):
        gateway.key_from_url(
            "https://outside.test/talemotion/projects/one/image.png",
            expected_prefix="talemotion/projects/one",
        )
    with pytest.raises(ProviderError):
        gateway.key_from_url(
            "http://testserver/media/talemotion/projects/other/image.png",
            expected_prefix="talemotion/projects/one",
        )


def test_local_missing_file_uses_sanitized_storage_error(tmp_path: Path) -> None:
    gateway = LocalMediaStorageGateway(local_storage_config(tmp_path))

    with pytest.raises(ProviderError) as raised:
        gateway.download("talemotion/projects/missing/image.png")

    assert raised.value.code == "storage_failed"
    assert str(tmp_path) not in raised.value.message


def test_local_genblaze_sink_persists_in_same_root(tmp_path: Path) -> None:
    root = tmp_path / "media"
    source = tmp_path / "source.png"
    source.write_bytes(b"pipeline image")
    gateway = LocalMediaStorageGateway(local_storage_config(root))
    prefix = "talemotion/projects/project-1/runs/run-1"
    sink = gateway.sink(prefix)
    asset = Asset(url=source.as_uri(), media_type="image/png")

    try:
        persisted = sink.put_asset(asset, tenant_id="project-1")
    finally:
        sink.close()

    key = gateway.key_from_url(persisted.url, expected_prefix=prefix)
    assert gateway.download(key) == b"pipeline image"
    assert (root / key).is_file()


def test_b2_key_parsing_and_preview_behavior_remain_unchanged(
    monkeypatch,
) -> None:
    class Backend:
        def get_url(self, key: str, *, expires_in: int) -> str:
            assert expires_in == 900
            return f"https://signed.example.invalid/{key}"

        def close(self) -> None:
            return None

    monkeypatch.setattr(
        b2_module.S3StorageBackend,
        "for_backblaze",
        lambda *_args, **_kwargs: Backend(),
    )
    gateway = B2MediaStorageGateway(storage_config())
    key = "talemotion/projects/project/assets/image.png"

    assert gateway.presign_preview(key).endswith(key)
    assert gateway.key_from_url(
        f"https://s3.test.invalid/test-bucket/{key}",
        expected_prefix="talemotion/projects/project",
    ) == key
