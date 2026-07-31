from collections.abc import Iterator
from contextlib import contextmanager

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.api.v1 import scenes as scene_routes
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
    assert persisted.json()["input_payload"] == {
        "duration_seconds": 5,
        "generate_video": True,
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
            model="image-model",
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
            model="video-model",
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
    assert video.json()["provenance_object_key"].endswith(".manifest.json")
