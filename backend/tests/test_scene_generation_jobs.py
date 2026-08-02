from collections.abc import Iterator
from contextlib import contextmanager

from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.api.v1 import assets as asset_routes
from app.api.v1 import scenes as scene_routes
from app.models import UsageOperation, UsageRecord
from app.schemas.scene_run import (
    SceneImageCompletedEvent,
    SceneImageStartedEvent,
    SceneRunAsset,
    SceneRunCompletedEvent,
    SceneRunEvent,
    SceneRunRequest,
    SceneRunStartedEvent,
    SceneVideoCompletedEvent,
    SceneVideoStartedEvent,
)
from app.services import scene_generation as scene_generation_service
from app.tasks import media as media_tasks


def _create_scene(
    client: TestClient,
    project_payload: dict[str, object],
) -> str:
    project = client.post("/api/v1/projects", json=project_payload).json()
    chapter_id = project["chapters"][0]["id"]
    response = client.post(
        f"/api/v1/chapters/{chapter_id}/scenes",
        json={
            "title": "An Empire Emerges",
            "narration": "Majapahit rose through maritime strategy.",
            "visual_prompt": "A plausible Majapahit port at sunrise.",
            "duration_seconds": 5,
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_scene_generation_creates_persisted_queued_job(
    client: TestClient,
    project_payload: dict[str, object],
    monkeypatch,
) -> None:
    queued: list[str] = []
    monkeypatch.setattr(scene_routes, "enqueue_scene_media", queued.append)
    scene_id = _create_scene(client, project_payload)

    response = client.post(
        f"/api/v1/scenes/{scene_id}/generations",
        json={"duration_seconds": 5, "generate_video": True},
    )

    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "queued"
    assert body["scene_id"] == scene_id
    assert queued == [body["id"]]

    persisted = client.get(f"/api/v1/jobs/{body['id']}")
    assert persisted.status_code == 200
    payload = persisted.json()["input_payload"]
    assert payload["duration_seconds"] == 5
    assert payload["generate_video"] is True
    assert payload["provider_selections"] == {
        "image": {
            "capability": "image",
            "provider": "gmicloud",
            "model": "seedream-5.0-lite",
        },
        "video": {
            "capability": "video",
            "provider": "gmicloud",
            "model": "wan2.6-i2v",
        },
    }


def test_scene_generation_rejects_a_second_active_job(
    client: TestClient,
    project_payload: dict[str, object],
    monkeypatch,
) -> None:
    monkeypatch.setattr(scene_routes, "enqueue_scene_media", lambda _job_id: None)
    scene_id = _create_scene(client, project_payload)
    first = client.post(f"/api/v1/scenes/{scene_id}/generations", json={})
    second = client.post(f"/api/v1/scenes/{scene_id}/generations", json={})
    assert first.status_code == 202
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "state_conflict"


def test_scene_generation_idempotency_returns_the_original_job(
    client: TestClient,
    project_payload: dict[str, object],
    monkeypatch,
) -> None:
    dispatched: list[str] = []
    monkeypatch.setattr(scene_routes, "enqueue_scene_media", dispatched.append)
    scene_id = _create_scene(client, project_payload)
    headers = {"Idempotency-Key": "scene-generate-once"}

    first = client.post(
        f"/api/v1/scenes/{scene_id}/generations",
        json={},
        headers=headers,
    )
    second = client.post(
        f"/api/v1/scenes/{scene_id}/generations",
        json={},
        headers=headers,
    )

    assert first.status_code == 202
    assert second.status_code == 202
    assert second.json()["id"] == first.json()["id"]
    assert dispatched == [first.json()["id"]]


def test_scene_regeneration_persists_instruction_and_lineage(
    client: TestClient,
    project_payload: dict[str, object],
    session_factory: sessionmaker[Session],
    monkeypatch,
) -> None:
    monkeypatch.setattr(scene_routes, "enqueue_scene_media", lambda _job_id: None)
    scene_id = _create_scene(client, project_payload)
    original = client.post(
        f"/api/v1/scenes/{scene_id}/generations",
        json={"generate_video": True},
    ).json()

    @contextmanager
    def test_session_scope() -> Iterator[Session]:
        with session_factory() as session:
            yield session

    monkeypatch.setattr(media_tasks, "session_scope", test_session_scope)
    media_tasks.execute_scene_media_job(
        original["id"],
        generator=FakeSceneMediaGenerator(),
    )
    active_asset_id = client.get(f"/api/v1/scenes/{scene_id}").json()[
        "active_asset_id"
    ]
    response = client.post(
        f"/api/v1/scenes/{scene_id}/regenerations",
        json={"additional_instruction": "Use warmer sunrise light."},
    )
    assert response.status_code == 202
    assert response.json()["type"] == "scene_regeneration"
    assert response.json()["input_payload"]["parent_asset_id"] == active_asset_id


class FakeSceneMediaGenerator:
    def __init__(
        self,
        *,
        image_provider: str = "test-image-provider",
        image_model: str = "image-model",
        video_provider: str = "test-video-provider",
        video_model: str = "video-model",
    ) -> None:
        self.image_provider = image_provider
        self.image_model = image_model
        self.video_provider = video_provider
        self.video_model = video_model

    def run(
        self, request: SceneRunRequest, run_id: str
    ) -> Iterator[SceneRunEvent]:
        common = {
            "run_id": run_id,
            "project_id": request.project_id,
            "scene_id": request.scene_id,
        }
        image = SceneRunAsset(
            kind="image",
            media_type="image/png",
            asset_url="s3://bucket/talemotion/image.png",
            sha256="a" * 64,
            storage_object_key=(
                f"talemotion/projects/{request.project_id}/scenes/"
                f"{request.scene_id}/runs/{run_id}/image.png"
            ),
            file_size_bytes=1024,
            provider=self.image_provider,
            model=self.image_model,
        )
        video = SceneRunAsset(
            kind="video",
            media_type="video/mp4",
            asset_url="s3://bucket/talemotion/video.mp4",
            sha256="b" * 64,
            storage_object_key=(
                f"talemotion/projects/{request.project_id}/scenes/"
                f"{request.scene_id}/runs/{run_id}/video.mp4"
            ),
            file_size_bytes=4096,
            provider=self.video_provider,
            model=self.video_model,
        )
        yield SceneRunStartedEvent(**common)
        yield SceneImageStartedEvent(model="image-model", **common)
        yield SceneImageCompletedEvent(
            asset=image,
            manifest_url="s3://bucket/image-manifest.json",
            manifest_object_key=f"{image.storage_object_key}.manifest.json",
            **common,
        )
        yield SceneVideoStartedEvent(model="video-model", **common)
        yield SceneVideoCompletedEvent(
            asset=video,
            manifest_url="s3://bucket/video-manifest.json",
            manifest_object_key=f"{video.storage_object_key}.manifest.json",
            **common,
        )
        yield SceneRunCompletedEvent(
            image=image,
            video=video,
            manifest_url="s3://bucket/video-manifest.json",
            manifest_object_key=f"{video.storage_object_key}.manifest.json",
            **common,
        )

    def presign_preview(self, key: str) -> str:
        return f"https://signed.example.invalid/{key}"


def test_mixed_provider_snapshot_drives_asset_and_usage_attribution(
    client: TestClient,
    project_payload: dict[str, object],
    session_factory: sessionmaker[Session],
    monkeypatch,
) -> None:
    monkeypatch.setattr(scene_routes, "enqueue_scene_media", lambda _job_id: None)
    monkeypatch.setattr(
        scene_generation_service.settings,
        "talemotion_image_provider",
        "replicate",
    )
    monkeypatch.setattr(
        scene_generation_service.settings,
        "talemotion_image_model",
        "black-forest-labs/flux-schnell",
    )
    scene_id = _create_scene(client, project_payload)
    queued = client.post(
        f"/api/v1/scenes/{scene_id}/generations",
        json={"duration_seconds": 5, "generate_video": True},
    ).json()
    snapshot = queued["input_payload"]["provider_selections"]
    assert snapshot == {
        "image": {
            "capability": "image",
            "provider": "replicate",
            "model": "black-forest-labs/flux-schnell",
        },
        "video": {
            "capability": "video",
            "provider": "gmicloud",
            "model": "wan2.6-i2v",
        },
    }

    monkeypatch.setattr(
        scene_generation_service.settings,
        "talemotion_image_provider",
        "gmicloud",
    )
    monkeypatch.setattr(
        scene_generation_service.settings,
        "talemotion_image_model",
        "changed-after-enqueue",
    )

    @contextmanager
    def test_session_scope() -> Iterator[Session]:
        with session_factory() as session:
            yield session

    monkeypatch.setattr(media_tasks, "session_scope", test_session_scope)
    result = media_tasks.execute_scene_media_job(
        queued["id"],
        generator=FakeSceneMediaGenerator(
            image_provider="replicate",
            image_model="black-forest-labs/flux-schnell",
            video_provider="gmicloud",
            video_model="wan2.6-i2v",
        ),
    )
    image = client.get(f"/api/v1/assets/{result['image_asset_id']}").json()
    video = client.get(f"/api/v1/assets/{result['video_asset_id']}").json()
    assert (image["provider"], image["model_name"]) == (
        "replicate",
        "black-forest-labs/flux-schnell",
    )
    assert (video["provider"], video["model_name"]) == (
        "gmicloud",
        "wan2.6-i2v",
    )
    with session_factory() as session:
        usage = session.scalars(
            select(UsageRecord).where(UsageRecord.job_id == queued["id"])
        ).all()
    by_operation = {record.operation: record for record in usage}
    image_usage = by_operation[UsageOperation.IMAGE_GENERATION]
    video_usage = by_operation[UsageOperation.VIDEO_GENERATION]
    assert (image_usage.provider, image_usage.model_name) == (
        "replicate",
        "black-forest-labs/flux-schnell",
    )
    assert (video_usage.provider, video_usage.model_name) == (
        "gmicloud",
        "wan2.6-i2v",
    )


def test_worker_persists_assets_and_completes_job(
    client: TestClient,
    project_payload: dict[str, object],
    session_factory: sessionmaker[Session],
    monkeypatch,
) -> None:
    monkeypatch.setattr(scene_routes, "enqueue_scene_media", lambda _job_id: None)
    scene_id = _create_scene(client, project_payload)
    queued = client.post(
        f"/api/v1/scenes/{scene_id}/generations",
        json={"duration_seconds": 5, "generate_video": True},
    ).json()

    @contextmanager
    def test_session_scope() -> Iterator[Session]:
        with session_factory() as session:
            yield session

    monkeypatch.setattr(media_tasks, "session_scope", test_session_scope)
    result = media_tasks.execute_scene_media_job(
        queued["id"],
        generator=FakeSceneMediaGenerator(),
    )

    assert result["status"] == "completed"
    job = client.get(f"/api/v1/jobs/{queued['id']}").json()
    assert job["status"] == "completed"
    assert job["progress"] == 100
    assert job["result_payload"]["image_asset_id"]
    assert job["result_payload"]["video_asset_id"]

    video = client.get(
        f"/api/v1/assets/{job['result_payload']['video_asset_id']}"
    )
    assert video.status_code == 200
    assert video.json()["type"] == "video"
    assert video.json()["provider"] == "test-video-provider"
    assert video.json()["provenance_object_key"].endswith(".manifest.json")
    image = client.get(
        f"/api/v1/assets/{job['result_payload']['image_asset_id']}"
    )
    assert image.json()["provider"] == "test-image-provider"

    monkeypatch.setattr(
        asset_routes.settings, "talemotion_image_provider", "unsupported"
    )
    monkeypatch.setattr(asset_routes.settings, "b2_region", "test-region")
    monkeypatch.setattr(
        asset_routes.settings, "b2_bucket_name", "test-bucket"
    )
    monkeypatch.setattr(
        asset_routes.settings, "b2_key_id", SecretStr("test-key")
    )
    monkeypatch.setattr(
        asset_routes.settings,
        "b2_application_key",
        SecretStr("test-application-key"),
    )
    class PreviewStorage:
        def presign_preview(self, key: str) -> str:
            return f"https://signed.example.invalid/{key}"

    monkeypatch.setattr(
        asset_routes,
        "create_media_storage",
        lambda _settings: PreviewStorage(),
    )
    preview = client.post(
        f"/api/v1/assets/{job['result_payload']['image_asset_id']}/preview-url"
    )
    assert preview.status_code == 200
