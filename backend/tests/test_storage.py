from datetime import timedelta
from pathlib import Path

from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy.orm import Session, sessionmaker

from app.api.dependencies import get_storage
from app.core.config import AppConfig
from app.core.ids import utc_now
from app.integrations.storage import B2Storage
from app.main import app
from app.models.asset import Asset, AssetStatus, AssetType
from tests.test_pipelines import seed_project


class FakeS3Client:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, object]]] = []

    def put_object(self, **kwargs: object) -> None:
        self.calls.append(("put_object", kwargs))

    def upload_file(self, path: str, bucket: str, key: str, **kwargs: object) -> None:
        self.calls.append(
            (
                "upload_file",
                {"path": path, "bucket": bucket, "key": key, **kwargs},
            )
        )

    def download_file(self, bucket: str, key: str, destination: str) -> None:
        Path(destination).write_bytes(b"downloaded")
        self.calls.append(
            (
                "download_file",
                {"bucket": bucket, "key": key, "destination": destination},
            )
        )

    def delete_object(self, **kwargs: object) -> None:
        self.calls.append(("delete_object", kwargs))

    def head_object(self, **kwargs: object) -> None:
        self.calls.append(("head_object", kwargs))

    def generate_presigned_url(self, *args: object, **kwargs: object) -> str:
        self.calls.append(("generate_presigned_url", {"args": args, **kwargs}))
        return "https://signed.example.invalid/asset"


def b2_config() -> AppConfig:
    return AppConfig(
        b2_endpoint="https://s3.us-west-004.backblazeb2.com",
        b2_region="us-west-004",
        b2_bucket="talemotion-media",
        b2_key_id=SecretStr("key-id"),
        b2_application_key=SecretStr("application-key"),
    )


def test_b2_adapter_uses_s3_client_without_exposing_credentials(
    tmp_path: Path,
) -> None:
    client = FakeS3Client()
    factory_arguments: dict[str, object] = {}

    def factory(service: str, **kwargs: object):
        factory_arguments.update({"service": service, **kwargs})
        return client

    storage = B2Storage(b2_config(), client_factory=factory)
    storage.upload_bytes("projects/p/scenes/s/images/v1.png", b"png", "image/png")
    destination = tmp_path / "asset.png"
    storage.download_file("projects/p/scenes/s/images/v1.png", destination)
    url, expires_at = storage.signed_url(
        "projects/p/scenes/s/images/v1.png",
        download=True,
    )

    assert factory_arguments["service"] == "s3"
    assert factory_arguments["endpoint_url"] == (
        "https://s3.us-west-004.backblazeb2.com"
    )
    assert destination.read_bytes() == b"downloaded"
    assert url == "https://signed.example.invalid/asset"
    assert expires_at.tzinfo is not None
    assert {call[0] for call in client.calls} == {
        "put_object",
        "download_file",
        "generate_presigned_url",
    }


class SignedUrlStorage:
    bucket = "talemotion-test"

    def signed_url(self, key: str, *, download: bool = False):
        suffix = "download" if download else "preview"
        return (
            f"https://signed.example.invalid/{suffix}/{key}",
            utc_now() + timedelta(minutes=15),
        )


def test_asset_preview_and_download_return_short_lived_signed_urls(
    client: TestClient,
    session_factory: sessionmaker[Session],
) -> None:
    with session_factory() as session:
        project = seed_project(session)
        asset = Asset(
            project_id=project.id,
            scene_id=None,
            parent_asset_id=None,
            type=AssetType.FINAL_RENDER,
            version=1,
            status=AssetStatus.READY,
            provider="ffmpeg",
            model="ffmpeg",
            prompt=None,
            generation_instruction=None,
            b2_bucket="talemotion-test",
            b2_object_key=f"projects/{project.id}/renders/v1.mp4",
            mime_type="video/mp4",
            file_size_bytes=128,
            sha256="0" * 64,
            provenance_object_key=None,
        )
        session.add(asset)
        session.commit()
        asset_id = asset.id

    app.dependency_overrides[get_storage] = SignedUrlStorage
    try:
        preview = client.post(f"/api/v1/assets/{asset_id}/preview-url")
        download = client.post(f"/api/v1/assets/{asset_id}/download-url")
    finally:
        app.dependency_overrides.pop(get_storage, None)

    assert preview.status_code == 200
    assert "/preview/" in preview.json()["url"]
    assert download.status_code == 200
    assert "/download/" in download.json()["url"]
    assert preview.json()["expires_at"] != download.json()["url"]
