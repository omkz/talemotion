from pathlib import Path

from fastapi.testclient import TestClient
from starlette.routing import Mount

from app.core.config import AppConfig
from app.main import create_app


def app_config(root: Path, *, storage_provider: str) -> AppConfig:
    return AppConfig(
        database_url="postgresql+psycopg://test:test@localhost/test",
        redis_url="redis://localhost:6379/15",
        celery_broker_url="redis://localhost:6379/15",
        talemotion_storage_provider=storage_provider,
        talemotion_local_storage_path=root,
        talemotion_local_storage_base_url="http://localhost:8000/media",
        _env_file=None,
    )


def mounted_paths(config: AppConfig) -> set[str]:
    return {
        route.path
        for route in create_app(config).routes
        if isinstance(route, Mount)
    }


def test_local_storage_mounts_and_serves_media(tmp_path: Path) -> None:
    root = tmp_path / "local-media"
    media = root / "talemotion" / "projects" / "one" / "image.png"
    media.parent.mkdir(parents=True)
    media.write_bytes(b"local preview")
    config = app_config(root, storage_provider="local")

    assert "/media" in mounted_paths(config)
    response = TestClient(create_app(config)).get(
        "/media/talemotion/projects/one/image.png"
    )
    assert response.status_code == 200
    assert response.content == b"local preview"


def test_b2_storage_does_not_mount_local_media(tmp_path: Path) -> None:
    assert "/media" not in mounted_paths(
        app_config(tmp_path, storage_provider="b2")
    )
