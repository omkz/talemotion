import subprocess
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy.orm import Session, sessionmaker

from app.api.v1 import renders as render_routes
from app.media import StoredMediaArtifact
from app.models.asset import AssetType
from app.models.render import RenderStatus
from app.rendering import RenderComposition, SceneMediaInput
from app.rendering.ffmpeg import FFmpegComposer, RenderCompositionError
from app.repositories.sqlalchemy import (
    AssetRepository,
    ProjectRepository,
    RenderRepository,
)
from app.tasks import rendering as render_tasks


class FakeRenderGateway:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.narration_calls: list[str] = []
        self.music_calls = 0

    def download(self, key: str) -> bytes:
        return self.objects[key]

    def upload(
        self,
        *,
        key: str,
        data: bytes,
        media_type: str,
    ) -> StoredMediaArtifact:
        self.objects[key] = data
        return self._artifact(key, media_type, len(data), "talemotion", "generated")

    def generate_narration(
        self,
        *,
        project_id: str,
        scene_id: str,
        text: str,
    ) -> StoredMediaArtifact:
        self.narration_calls.append(scene_id)
        key = f"talemotion/projects/{project_id}/audio/{scene_id}.mp3"
        self.objects[key] = b"narration"
        return self._artifact(key, "audio/mpeg", 9, "gmicloud", "tts-model")

    def generate_music(
        self,
        *,
        project_id: str,
        prompt: str,
        duration_seconds: int,
    ) -> StoredMediaArtifact:
        self.music_calls += 1
        key = f"talemotion/projects/{project_id}/music/score.mp3"
        self.objects[key] = b"music"
        return self._artifact(key, "audio/mpeg", 5, "gmicloud", "music-model")

    def presign_preview(self, key: str) -> str:
        return f"https://signed.example.invalid/{key}"

    @staticmethod
    def _artifact(
        key: str,
        media_type: str,
        size: int,
        provider: str,
        model: str,
    ) -> StoredMediaArtifact:
        return StoredMediaArtifact(
            storage_object_key=key,
            media_type=media_type,
            file_size_bytes=size,
            sha256="a" * 64,
            provider=provider,
            model=model,
            manifest_object_key=f"{key}.manifest.json"
            if provider == "gmicloud"
            else None,
        )


class FakeComposer:
    def __init__(self, *, fail: bool = False) -> None:
        self.fail = fail
        self.compositions: list[RenderComposition] = []
        self.workspace: Path | None = None

    def compose(self, composition: RenderComposition) -> None:
        self.compositions.append(composition)
        self.workspace = composition.workspace
        if self.fail:
            raise RenderCompositionError("failed")
        composition.output_path.write_bytes(b"real-mp4-test-bytes")


def _project_with_assets(
    client: TestClient,
    project_payload: dict[str, object],
    session_factory: sessionmaker[Session],
    gateway: FakeRenderGateway,
) -> tuple[str, list[str]]:
    project = client.post("/api/v1/projects", json=project_payload).json()
    chapter_id = project["chapters"][0]["id"]
    scene_ids: list[str] = []
    for position, duration in enumerate((11, 11, 11, 12), start=1):
        scene = client.post(
            f"/api/v1/chapters/{chapter_id}/scenes",
            json={
                "title": f"Scene {position}",
                "narration": f"Narration {position}",
                "visual_prompt": f"Visual {position}",
                "duration_seconds": duration,
            },
        ).json()
        scene_ids.append(scene["id"])
    with session_factory() as session:
        projects = ProjectRepository(session)
        assets = AssetRepository(session)
        for position, scene_id in enumerate(scene_ids, start=1):
            scene = projects.get_scene(scene_id)
            assert scene is not None
            key = f"talemotion/projects/{project['id']}/scene-{position}.png"
            gateway.objects[key] = f"image-{position}".encode()
            asset = assets.create(
                project_id=project["id"],
                scene_id=scene_id,
                asset_type=AssetType.IMAGE,
                version=1,
                provider="gmicloud",
                model_name="image-model",
                prompt=scene.visual_prompt,
                generation_parameters={},
                storage_bucket="test-bucket",
                storage_object_key=key,
                mime_type="image/png",
                file_size_bytes=len(gateway.objects[key]),
                sha256=str(position) * 64,
                provenance_object_key=f"{key}.manifest.json",
            )
            scene.active_asset_id = asset.id
            scene.active_asset_version = 1
        session.commit()
    return str(project["id"]), scene_ids


def _test_session_scope(
    factory: sessionmaker[Session],
):
    @contextmanager
    def scope() -> Iterator[Session]:
        with factory() as session:
            yield session

    return scope


def test_render_rejects_missing_scene_assets(
    client: TestClient,
    project_payload: dict[str, object],
) -> None:
    project = client.post("/api/v1/projects", json=project_payload).json()
    response = client.post(f"/api/v1/projects/{project['id']}/renders", json={})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "state_conflict"


def test_render_job_creation_and_version_increment(
    client: TestClient,
    project_payload: dict[str, object],
    session_factory: sessionmaker[Session],
    monkeypatch,
) -> None:
    gateway = FakeRenderGateway()
    project_id, _ = _project_with_assets(
        client, project_payload, session_factory, gateway
    )
    monkeypatch.setattr(render_routes, "enqueue_render", lambda _job_id: None)

    first = client.post(
        f"/api/v1/projects/{project_id}/renders",
        json={
            "narration_enabled": False,
            "captions_enabled": False,
            "music_enabled": False,
        },
    )
    assert first.status_code == 202
    assert first.json()["type"] == "render"
    render_id = first.json()["input_payload"]["render_id"]
    render = client.get(f"/api/v1/renders/{render_id}").json()
    assert render["version"] == 1
    assert render["narration_enabled"] is False

    with session_factory() as session:
        stored = RenderRepository(session).get(render_id, for_update=True)
        assert stored is not None
        stored.status = RenderStatus.FAILED
        session.commit()
    second = client.post(f"/api/v1/projects/{project_id}/renders", json={})
    assert second.status_code == 202
    second_render = client.get(
        f"/api/v1/renders/{second.json()['input_payload']['render_id']}"
    ).json()
    assert second_render["version"] == 2


def test_render_idempotency_does_not_create_another_version(
    client: TestClient,
    project_payload: dict[str, object],
    session_factory: sessionmaker[Session],
    monkeypatch,
) -> None:
    gateway = FakeRenderGateway()
    project_id, _ = _project_with_assets(
        client, project_payload, session_factory, gateway
    )
    dispatched: list[str] = []
    monkeypatch.setattr(render_routes, "enqueue_render", dispatched.append)
    headers = {"Idempotency-Key": "final-render-once"}
    options = {
        "narration_enabled": False,
        "captions_enabled": False,
        "music_enabled": False,
    }
    first = client.post(
        f"/api/v1/projects/{project_id}/renders",
        json=options,
        headers=headers,
    )
    second = client.post(
        f"/api/v1/projects/{project_id}/renders",
        json=options,
        headers=headers,
    )
    assert first.status_code == 202
    assert second.status_code == 202
    assert second.json()["id"] == first.json()["id"]
    assert dispatched == [first.json()["id"]]
    renders = client.get(
        f"/api/v1/projects/{project_id}/renders"
    ).json()["items"]
    assert len(renders) == 1


def test_worker_renders_all_optional_stages_and_persists_final_asset(
    client: TestClient,
    project_payload: dict[str, object],
    session_factory: sessionmaker[Session],
    monkeypatch,
) -> None:
    gateway = FakeRenderGateway()
    project_id, scene_ids = _project_with_assets(
        client, project_payload, session_factory, gateway
    )
    monkeypatch.setattr(render_routes, "enqueue_render", lambda _job_id: None)
    queued = client.post(
        f"/api/v1/projects/{project_id}/renders",
        json={
            "narration_enabled": True,
            "captions_enabled": True,
            "music_enabled": True,
        },
    ).json()
    monkeypatch.setattr(
        render_tasks,
        "session_scope",
        _test_session_scope(session_factory),
    )
    monkeypatch.setattr(render_tasks.settings, "talemotion_tts_model", "tts-model")
    monkeypatch.setattr(
        render_tasks.settings, "talemotion_music_model", "music-model"
    )
    composer = FakeComposer()

    result = render_tasks.execute_render_job(
        queued["id"],
        gateway=gateway,
        composer=composer,
    )

    assert result["status"] == "completed"
    assert gateway.narration_calls == scene_ids
    assert gateway.music_calls == 1
    assert [scene.duration_seconds for scene in composer.compositions[0].scenes] == [
        11,
        11,
        11,
        12,
    ]
    assert composer.compositions[0].captions_path is not None
    assert composer.workspace is not None and not composer.workspace.exists()
    render = client.get(f"/api/v1/renders/{result['render_id']}").json()
    assert render["status"] == "completed"
    final_asset = client.get(f"/api/v1/assets/{result['asset_id']}").json()
    assert final_asset["type"] == "final_video"
    assert final_asset["provider"] == "talemotion"
    assert final_asset["storage_object_key"].endswith("/final.mp4")


def test_worker_skips_disabled_optional_stages(
    client: TestClient,
    project_payload: dict[str, object],
    session_factory: sessionmaker[Session],
    monkeypatch,
) -> None:
    gateway = FakeRenderGateway()
    project_id, _ = _project_with_assets(
        client, project_payload, session_factory, gateway
    )
    monkeypatch.setattr(render_routes, "enqueue_render", lambda _job_id: None)
    queued = client.post(
        f"/api/v1/projects/{project_id}/renders",
        json={
            "narration_enabled": False,
            "captions_enabled": False,
            "music_enabled": False,
        },
    ).json()
    monkeypatch.setattr(
        render_tasks,
        "session_scope",
        _test_session_scope(session_factory),
    )
    composer = FakeComposer()

    result = render_tasks.execute_render_job(
        queued["id"],
        gateway=gateway,
        composer=composer,
    )

    assert result["status"] == "completed"
    assert result["skipped_stages"] == [
        "generating_narration",
        "generating_music",
        "building_subtitles",
    ]
    assert gateway.narration_calls == []
    assert gateway.music_calls == 0
    assert all(
        scene.narration_path is None
        for scene in composer.compositions[0].scenes
    )


def test_worker_failure_marks_job_and_cleans_workspace(
    client: TestClient,
    project_payload: dict[str, object],
    session_factory: sessionmaker[Session],
    monkeypatch,
) -> None:
    gateway = FakeRenderGateway()
    project_id, _ = _project_with_assets(
        client, project_payload, session_factory, gateway
    )
    monkeypatch.setattr(render_routes, "enqueue_render", lambda _job_id: None)
    queued = client.post(
        f"/api/v1/projects/{project_id}/renders",
        json={
            "narration_enabled": False,
            "captions_enabled": False,
            "music_enabled": False,
        },
    ).json()
    monkeypatch.setattr(
        render_tasks,
        "session_scope",
        _test_session_scope(session_factory),
    )
    composer = FakeComposer(fail=True)

    result = render_tasks.execute_render_job(
        queued["id"],
        gateway=gateway,
        composer=composer,
    )

    assert result["status"] == "failed"
    job = client.get(f"/api/v1/jobs/{queued['id']}").json()
    assert job["error_code"] == "ffmpeg_failed"
    assert composer.workspace is not None and not composer.workspace.exists()


def test_render_preview_returns_signed_url(
    client: TestClient,
    project_payload: dict[str, object],
    session_factory: sessionmaker[Session],
    monkeypatch,
) -> None:
    gateway = FakeRenderGateway()
    project_id, _ = _project_with_assets(
        client, project_payload, session_factory, gateway
    )
    monkeypatch.setattr(render_routes, "enqueue_render", lambda _job_id: None)
    queued = client.post(
        f"/api/v1/projects/{project_id}/renders",
        json={
            "narration_enabled": False,
            "captions_enabled": False,
            "music_enabled": False,
        },
    ).json()
    monkeypatch.setattr(
        render_tasks,
        "session_scope",
        _test_session_scope(session_factory),
    )
    result = render_tasks.execute_render_job(
        queued["id"],
        gateway=gateway,
        composer=FakeComposer(),
    )
    monkeypatch.setattr(
        render_routes.settings, "talemotion_music_provider", "unsupported"
    )
    monkeypatch.setattr(render_routes.settings, "b2_region", "test-region")
    monkeypatch.setattr(
        render_routes.settings, "b2_bucket_name", "test-bucket"
    )
    monkeypatch.setattr(
        render_routes.settings, "b2_key_id", SecretStr("test-key")
    )
    monkeypatch.setattr(
        render_routes.settings,
        "b2_application_key",
        SecretStr("test-application-key"),
    )
    monkeypatch.setattr(
        render_routes.B2MediaStorageGateway,
        "presign_preview",
        lambda _storage, key: gateway.presign_preview(key),
    )

    response = client.post(
        f"/api/v1/renders/{result['render_id']}/preview-url"
    )
    assert response.status_code == 200
    assert response.json()["url"].startswith("https://signed.example.invalid/")


def test_ffmpeg_commands_use_argument_arrays_without_shell() -> None:
    calls: list[tuple[list[str], dict[str, object]]] = []

    def runner(
        command: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        calls.append((command, kwargs))
        return subprocess.CompletedProcess(command, 0, "", "")

    composer = FFmpegComposer(runner=runner)
    command = composer.build_segment_command(
        SceneMediaInput(
            path=Path("/tmp/input image.png"),
            kind="image",
            duration_seconds=5,
        ),
        Path("/tmp/output.mp4"),
    )
    assert command[0] == "ffmpeg"
    assert command[1:3] == ["-loop", "1"]
    assert "/tmp/input image.png" in command
    assert all(";" not in argument for argument in command)
    assert calls == []
