import os
from collections.abc import Iterator
from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.api.v1 import jobs as job_routes
from app.api.v1 import projects as project_routes
from app.api.v1 import renders as render_routes
from app.api.v1 import scenes as scene_routes
from app.repositories.sqlalchemy import ProjectRepository
from app.schemas.scene_run import (
    SceneRunEvent,
    SceneRunFailedEvent,
    SceneRunRequest,
    SceneRunStartedEvent,
)
from app.tasks import media as media_tasks
from app.tasks import rendering as render_tasks
from app.tasks import storyboard as storyboard_tasks
from tests.test_project_generation import ValidStoryboardGenerator
from tests.test_rendering import FakeComposer, FakeRenderGateway
from tests.test_scene_generation_jobs import FakeSceneMediaGenerator


class FailedSceneGenerator:
    def run(
        self,
        request: SceneRunRequest,
        run_id: str,
    ) -> Iterator[SceneRunEvent]:
        common = {
            "run_id": run_id,
            "project_id": request.project_id,
            "scene_id": request.scene_id,
        }
        yield SceneRunStartedEvent(**common)
        yield SceneRunFailedEvent(
            code="provider_rate_limited",
            message="The provider rate limit was reached.",
            retryable=True,
            **common,
        )

    def presign_preview(self, key: str) -> str:
        return f"https://signed.example.invalid/{key}"


def _scope(
    factory: sessionmaker[Session],
):
    @contextmanager
    def test_session_scope() -> Iterator[Session]:
        with factory() as session:
            yield session

    return test_session_scope


def test_complete_historical_workflow_with_fake_providers(
    client: TestClient,
    project_payload: dict[str, object],
    session_factory: sessionmaker[Session],
    monkeypatch,
) -> None:
    scope = _scope(session_factory)
    monkeypatch.setattr(storyboard_tasks, "session_scope", scope)
    monkeypatch.setattr(media_tasks, "session_scope", scope)
    monkeypatch.setattr(render_tasks, "session_scope", scope)
    monkeypatch.setattr(project_routes, "enqueue_storyboard", lambda _id: None)
    monkeypatch.setattr(
        project_routes,
        "enqueue_project_children",
        lambda _ids: None,
    )
    monkeypatch.setattr(scene_routes, "enqueue_scene_media", lambda _id: None)
    monkeypatch.setattr(render_routes, "enqueue_render", lambda _id: None)
    monkeypatch.setattr(
        job_routes.generate_scene_media,
        "apply_async",
        lambda **_kwargs: None,
    )

    project = client.post("/api/v1/projects", json=project_payload).json()
    storyboard = client.post(
        f"/api/v1/projects/{project['id']}/storyboard",
        json={},
        headers={"Idempotency-Key": "e2e-storyboard"},
    ).json()
    storyboard_tasks.execute_storyboard_job(
        storyboard["id"],
        generator=ValidStoryboardGenerator(),
    )
    project = client.get(f"/api/v1/projects/{project['id']}").json()
    assert len(project["chapters"][0]["scenes"]) == 4

    parent = client.post(
        f"/api/v1/projects/{project['id']}/generations",
        json={"generate_video": True},
        headers={"Idempotency-Key": "e2e-generate-all"},
    ).json()
    first_child, *remaining_children = parent["children"]
    failed = media_tasks.execute_scene_media_job(
        first_child["id"],
        generator=FailedSceneGenerator(),
    )
    assert failed["status"] == "failed"
    retry = client.post(f"/api/v1/jobs/{first_child['id']}/retry").json()
    media_tasks.execute_scene_media_job(
        retry["id"],
        generator=FakeSceneMediaGenerator(),
    )
    for child in remaining_children:
        media_tasks.execute_scene_media_job(
            child["id"],
            generator=FakeSceneMediaGenerator(),
        )
    parent_after = client.get(f"/api/v1/jobs/{parent['id']}").json()
    assert parent_after["status"] == "completed"

    scene_id = project["chapters"][0]["scenes"][0]["id"]
    regeneration = client.post(
        f"/api/v1/scenes/{scene_id}/regenerations",
        json={"additional_instruction": "Use a wider harbor view."},
        headers={"Idempotency-Key": "e2e-regenerate-scene"},
    ).json()
    media_tasks.execute_scene_media_job(
        regeneration["id"],
        generator=FakeSceneMediaGenerator(),
    )
    regenerated = client.get(f"/api/v1/scenes/{scene_id}").json()
    assert regenerated["active_asset_version"] == 2

    gateway = FakeRenderGateway()
    with session_factory() as session:
        persisted = ProjectRepository(session).get(project["id"])
        assert persisted is not None
        for chapter in persisted.chapters:
            for scene in chapter.scenes:
                active = next(
                    asset
                    for asset in scene.assets
                    if asset.id == scene.active_asset_id
                )
                assert active.storage_object_key
                gateway.objects[active.storage_object_key] = b"scene-media"

    render_job = client.post(
        f"/api/v1/projects/{project['id']}/renders",
        json={
            "narration_enabled": False,
            "captions_enabled": False,
            "music_enabled": False,
        },
        headers={"Idempotency-Key": "e2e-final-render"},
    ).json()
    rendered = render_tasks.execute_render_job(
        render_job["id"],
        gateway=gateway,
        composer=FakeComposer(),
    )
    assert rendered["status"] == "completed"
    final_asset = client.get(
        f"/api/v1/assets/{rendered['asset_id']}"
    ).json()
    assert final_asset["type"] == "final_video"
    assert final_asset["storage_object_key"].endswith("/final.mp4")


@pytest.mark.real_provider
@pytest.mark.skipif(
    os.getenv("RUN_REAL_PROVIDER_TESTS") != "1",
    reason="Set RUN_REAL_PROVIDER_TESTS=1 to make paid provider calls.",
)
def test_real_scene_and_render_pipeline_when_explicitly_enabled(
    client: TestClient,
    project_payload: dict[str, object],
    session_factory: sessionmaker[Session],
    monkeypatch,
) -> None:
    scope = _scope(session_factory)
    monkeypatch.setattr(media_tasks, "session_scope", scope)
    monkeypatch.setattr(render_tasks, "session_scope", scope)
    monkeypatch.setattr(scene_routes, "enqueue_scene_media", lambda _id: None)
    monkeypatch.setattr(render_routes, "enqueue_render", lambda _id: None)
    project = client.post("/api/v1/projects", json=project_payload).json()
    scene = client.post(
        f"/api/v1/chapters/{project['chapters'][0]['id']}/scenes",
        json={
            "title": "Majapahit Harbor",
            "narration": "Majapahit grew through maritime trade.",
            "visual_prompt": (
                "Historically plausible Majapahit harbor, Southeast Asian jong "
                "ships, red brick architecture, vertical cinematic composition."
            ),
            "duration_seconds": 5,
        },
    ).json()
    media_job = client.post(
        f"/api/v1/scenes/{scene['id']}/generations",
        json={"duration_seconds": 5, "generate_video": True},
    ).json()
    assert media_tasks.execute_scene_media_job(media_job["id"])["status"] == (
        "completed"
    )
    render_job = client.post(
        f"/api/v1/projects/{project['id']}/renders",
        json={
            "narration_enabled": False,
            "captions_enabled": False,
            "music_enabled": False,
        },
    ).json()
    assert render_tasks.execute_render_job(render_job["id"])["status"] == (
        "completed"
    )
