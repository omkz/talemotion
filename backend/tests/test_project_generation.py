from collections.abc import Iterator
from contextlib import contextmanager

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.api.v1 import jobs as job_routes
from app.api.v1 import projects as project_routes
from app.models.job import JobStatus
from app.repositories.sqlalchemy import JobRepository
from app.schemas.storyboard import (
    HistoricalStoryboardDraft,
    StoryboardSceneDraft,
)
from app.services import project_generation as project_generation_service
from app.services.jobs import aggregate_parent_job
from app.tasks import storyboard as storyboard_tasks


class ValidStoryboardGenerator:
    def generate(
        self,
        *,
        topic: str,
        additional_direction: str,
        historical_accuracy_note: str | None,
        visual_style: str,
        duration_seconds: int,
    ) -> HistoricalStoryboardDraft:
        durations = [12, 11, 11, 11] if duration_seconds == 45 else [8, 8, 7, 7]
        return HistoricalStoryboardDraft(
            scenes=[
                StoryboardSceneDraft(
                    title=f"Historical scene {position}",
                    narration=f"Narration for {topic}, part {position}.",
                    visual_prompt=(
                        f"{visual_style}; plausible Southeast Asian setting; "
                        f"vertical composition; scene {position}."
                    ),
                    duration_seconds=duration,
                    position=position,
                )
                for position, duration in enumerate(durations, start=1)
            ]
        )


class InvalidStoryboardGenerator:
    def generate(
        self,
        *,
        topic: str,
        additional_direction: str,
        historical_accuracy_note: str | None,
        visual_style: str,
        duration_seconds: int,
    ) -> HistoricalStoryboardDraft:
        raise ValueError("Provider returned malformed structured output.")


def _use_mixed_media_settings(monkeypatch) -> None:
    monkeypatch.setattr(
        project_generation_service.settings,
        "talemotion_image_provider",
        "replicate",
    )
    monkeypatch.setattr(
        project_generation_service.settings,
        "talemotion_image_model",
        "black-forest-labs/flux-schnell",
    )


def _create_project(
    client: TestClient,
    project_payload: dict[str, object],
) -> dict[str, object]:
    response = client.post("/api/v1/projects", json=project_payload)
    assert response.status_code == 201
    return response.json()


def _run_storyboard(
    client: TestClient,
    project_payload: dict[str, object],
    session_factory: sessionmaker[Session],
    monkeypatch,
) -> tuple[str, str]:
    project = _create_project(client, project_payload)
    monkeypatch.setattr(project_routes, "enqueue_storyboard", lambda _job_id: None)
    queued = client.post(
        f"/api/v1/projects/{project['id']}/storyboard",
        json={"replace_existing": False},
    )
    assert queued.status_code == 202

    @contextmanager
    def test_session_scope() -> Iterator[Session]:
        with session_factory() as session:
            yield session

    monkeypatch.setattr(storyboard_tasks, "session_scope", test_session_scope)
    result = storyboard_tasks.execute_storyboard_job(
        queued.json()["id"],
        generator=ValidStoryboardGenerator(),
    )
    assert result["status"] == "completed"
    return str(project["id"]), str(queued.json()["id"])


def test_storyboard_job_creation_and_duplicate_active_rejection(
    client: TestClient,
    project_payload: dict[str, object],
    monkeypatch,
) -> None:
    project = _create_project(client, project_payload)
    queued_ids: list[str] = []
    monkeypatch.setattr(project_routes, "enqueue_storyboard", queued_ids.append)

    first = client.post(
        f"/api/v1/projects/{project['id']}/storyboard",
        json={"replace_existing": False},
    )
    second = client.post(
        f"/api/v1/projects/{project['id']}/storyboard",
        json={"replace_existing": False},
    )

    assert first.status_code == 202
    assert first.json()["type"] == "storyboard"
    assert first.json()["status"] == "queued"
    assert queued_ids == [first.json()["id"]]
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "state_conflict"


def test_storyboard_idempotency_returns_one_job(
    client: TestClient,
    project_payload: dict[str, object],
    monkeypatch,
) -> None:
    project = _create_project(client, project_payload)
    queued_ids: list[str] = []
    monkeypatch.setattr(project_routes, "enqueue_storyboard", queued_ids.append)
    headers = {"Idempotency-Key": "storyboard-once"}
    first = client.post(
        f"/api/v1/projects/{project['id']}/storyboard",
        json={},
        headers=headers,
    )
    second = client.post(
        f"/api/v1/projects/{project['id']}/storyboard",
        json={},
        headers=headers,
    )
    assert second.status_code == 202
    assert second.json()["id"] == first.json()["id"]
    assert queued_ids == [first.json()["id"]]


def test_storyboard_worker_persists_exactly_four_ordered_scenes(
    client: TestClient,
    project_payload: dict[str, object],
    session_factory: sessionmaker[Session],
    monkeypatch,
) -> None:
    project_id, job_id = _run_storyboard(
        client,
        project_payload,
        session_factory,
        monkeypatch,
    )

    project = client.get(f"/api/v1/projects/{project_id}").json()
    scenes = project["chapters"][0]["scenes"]
    assert project["status"] == "storyboard_ready"
    assert len(scenes) == 4
    assert [scene["position"] for scene in scenes] == [1, 2, 3, 4]
    assert sum(scene["duration_seconds"] for scene in scenes) == 45
    job = client.get(f"/api/v1/jobs/{job_id}").json()
    assert job["status"] == "completed"
    assert job["result_payload"]["scene_count"] == 4


def test_storyboard_worker_marks_invalid_structured_output_failed(
    client: TestClient,
    project_payload: dict[str, object],
    session_factory: sessionmaker[Session],
    monkeypatch,
) -> None:
    project = _create_project(client, project_payload)
    monkeypatch.setattr(project_routes, "enqueue_storyboard", lambda _job_id: None)
    job_id = client.post(
        f"/api/v1/projects/{project['id']}/storyboard",
        json={},
    ).json()["id"]

    @contextmanager
    def test_session_scope() -> Iterator[Session]:
        with session_factory() as session:
            yield session

    monkeypatch.setattr(storyboard_tasks, "session_scope", test_session_scope)
    result = storyboard_tasks.execute_storyboard_job(
        job_id,
        generator=InvalidStoryboardGenerator(),
    )

    assert result["status"] == "failed"
    job = client.get(f"/api/v1/jobs/{job_id}").json()
    assert job["error_code"] == "invalid_storyboard_output"
    project_after = client.get(f"/api/v1/projects/{project['id']}").json()
    assert project_after["chapters"][0]["scenes"] == []


def test_existing_scenes_require_explicit_storyboard_replacement(
    client: TestClient,
    project_payload: dict[str, object],
    monkeypatch,
) -> None:
    project = _create_project(client, project_payload)
    chapter_id = project["chapters"][0]["id"]
    created = client.post(
        f"/api/v1/chapters/{chapter_id}/scenes",
        json={
            "title": "Existing scene",
            "narration": "Existing narration.",
            "visual_prompt": "Existing visual.",
            "duration_seconds": 5,
        },
    )
    assert created.status_code == 201
    monkeypatch.setattr(project_routes, "enqueue_storyboard", lambda _job_id: None)

    response = client.post(
        f"/api/v1/projects/{project['id']}/storyboard",
        json={"replace_existing": False},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "state_conflict"


def test_generate_all_creates_parent_and_four_child_jobs(
    client: TestClient,
    project_payload: dict[str, object],
    session_factory: sessionmaker[Session],
    monkeypatch,
) -> None:
    _use_mixed_media_settings(monkeypatch)
    project_id, _ = _run_storyboard(
        client,
        project_payload,
        session_factory,
        monkeypatch,
    )
    queued_children: list[str] = []
    monkeypatch.setattr(
        project_routes,
        "enqueue_project_children",
        queued_children.extend,
    )

    response = client.post(
        f"/api/v1/projects/{project_id}/generations",
        json={"generate_video": True},
    )

    assert response.status_code == 202
    parent = response.json()
    assert parent["type"] == "project_generation"
    assert len(parent["children"]) == 4
    assert len(queued_children) == 4
    assert {child["id"] for child in parent["children"]} == set(queued_children)
    persisted = client.get(f"/api/v1/jobs/{parent['id']}").json()
    assert all(
        child["scene_id"] is not None for child in persisted["children"]
    )
    parent_selections = parent["input_payload"]["provider_selections"]
    assert parent_selections["image"] == {
        "capability": "image",
        "provider": "replicate",
        "model": "black-forest-labs/flux-schnell",
    }
    assert parent_selections["video"] == {
        "capability": "video",
        "provider": "gmicloud",
        "model": "wan2.6-i2v",
    }
    with session_factory() as session:
        jobs = JobRepository(session)
        assert all(
            child.input_payload["provider_selections"] == parent_selections
            for child in jobs.children(parent["id"])
        )


def test_parent_progress_uses_latest_persisted_child_jobs(
    client: TestClient,
    project_payload: dict[str, object],
    session_factory: sessionmaker[Session],
    monkeypatch,
) -> None:
    project_id, _ = _run_storyboard(
        client,
        project_payload,
        session_factory,
        monkeypatch,
    )
    monkeypatch.setattr(
        project_routes,
        "enqueue_project_children",
        lambda _job_ids: None,
    )
    parent = client.post(
        f"/api/v1/projects/{project_id}/generations",
        json={},
    ).json()

    with session_factory() as session:
        jobs = JobRepository(session)
        children = jobs.children(parent["id"])
        children[0].status = JobStatus.COMPLETED
        children[0].progress = 100
        children[1].status = JobStatus.RUNNING
        children[1].progress = 50
        session.commit()
        aggregate_parent_job(jobs, parent["id"])

    running = client.get(f"/api/v1/jobs/{parent['id']}").json()
    assert running["status"] == "running"
    assert running["progress"] == 25

    with session_factory() as session:
        jobs = JobRepository(session)
        children = jobs.children(parent["id"])
        for child in children:
            child.status = JobStatus.COMPLETED
            child.progress = 100
        session.commit()
        aggregate_parent_job(jobs, parent["id"])

    completed = client.get(f"/api/v1/jobs/{parent['id']}").json()
    assert completed["status"] == "completed"
    assert completed["progress"] == 100


def test_failed_child_can_retry_without_recreating_successful_children(
    client: TestClient,
    project_payload: dict[str, object],
    session_factory: sessionmaker[Session],
    monkeypatch,
) -> None:
    _use_mixed_media_settings(monkeypatch)
    project_id, _ = _run_storyboard(
        client,
        project_payload,
        session_factory,
        monkeypatch,
    )
    monkeypatch.setattr(
        project_routes,
        "enqueue_project_children",
        lambda _job_ids: None,
    )
    parent = client.post(
        f"/api/v1/projects/{project_id}/generations",
        json={},
    ).json()

    with session_factory() as session:
        jobs = JobRepository(session)
        children = jobs.children(parent["id"])
        failed_id = children[0].id
        children[0].status = JobStatus.FAILED
        children[0].progress = 40
        for child in children[1:]:
            child.status = JobStatus.COMPLETED
            child.progress = 100
        session.commit()
        aggregate_parent_job(jobs, parent["id"])

    failed_parent = client.get(f"/api/v1/jobs/{parent['id']}").json()
    assert failed_parent["status"] == "failed"
    assert failed_parent["progress"] == 75

    queued_retries: list[str] = []
    monkeypatch.setattr(
        job_routes.generate_scene_media,
        "apply_async",
        lambda *, args, queue, task_id=None: queued_retries.extend(args),
    )
    retried = client.post(f"/api/v1/jobs/{failed_id}/retry")
    assert retried.status_code == 200
    retry_id = retried.json()["id"]
    assert queued_retries == [retry_id]

    with session_factory() as session:
        jobs = JobRepository(session)
        retry = jobs.get_for_update(retry_id)
        assert retry is not None
        original = jobs.get(failed_id)
        assert original is not None
        assert retry.input_payload["provider_selections"] == (
            original.input_payload["provider_selections"]
        )
        assert retry.input_payload["provider_selections"]["image"] == {
            "capability": "image",
            "provider": "replicate",
            "model": "black-forest-labs/flux-schnell",
        }
        retry.status = JobStatus.COMPLETED
        retry.progress = 100
        session.commit()
        aggregate_parent_job(jobs, parent["id"])

    completed_parent = client.get(f"/api/v1/jobs/{parent['id']}").json()
    assert completed_parent["status"] == "completed"
    assert completed_parent["progress"] == 100
    assert len(completed_parent["children"]) == 4
