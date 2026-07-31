from collections.abc import Iterator
from contextlib import contextmanager
from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.api.v1 import jobs as job_routes
from app.core.ids import utc_now
from app.models.job import GenerationJob, JobStatus, JobType
from app.models.project import Project
from app.tasks import system as system_tasks


def persisted_job(
    client: TestClient,
    session_factory: sessionmaker[Session],
    project_payload: dict[str, object],
    *,
    status: JobStatus = JobStatus.QUEUED,
    retry_count: int = 0,
    max_retries: int = 2,
) -> GenerationJob:
    project = client.post("/api/v1/projects", json=project_payload).json()
    with session_factory() as session:
        persisted_project = session.get(Project, project["id"])
        assert persisted_project is not None
        job = GenerationJob(
            user_id=persisted_project.user_id,
            project_id=project["id"],
            type=JobType.STORYBOARD,
            status=status,
            progress=0,
            current_stage="queued",
            input_payload={"project_id": project["id"]},
            retry_count=retry_count,
            max_retries=max_retries,
        )
        session.add(job)
        session.commit()
        session.refresh(job)
        session.expunge(job)
        return job


def test_job_persistence_and_cancel_request(
    client: TestClient,
    session_factory: sessionmaker[Session],
    project_payload: dict[str, object],
) -> None:
    job = persisted_job(client, session_factory, project_payload)
    response = client.get(f"/api/v1/jobs/{job.id}")
    assert response.status_code == 200
    assert response.json()["input_payload"]["project_id"] == job.project_id

    response = client.post(f"/api/v1/jobs/{job.id}/cancel")
    assert response.status_code == 200
    assert response.json()["status"] == "cancel_requested"
    assert response.json()["cancel_requested_at"] is not None


def test_storyboard_retry_creates_new_persisted_job(
    client: TestClient,
    session_factory: sessionmaker[Session],
    project_payload: dict[str, object],
    monkeypatch,
) -> None:
    failed = persisted_job(
        client, session_factory, project_payload, status=JobStatus.FAILED
    )
    dispatched: list[str] = []
    monkeypatch.setattr(
        job_routes.generate_project_storyboard,
        "apply_async",
        lambda *, args, queue, task_id=None: dispatched.extend(args),
    )
    response = client.post(f"/api/v1/jobs/{failed.id}/retry")
    assert response.status_code == 200
    assert response.json()["id"] != failed.id
    assert response.json()["retry_count"] == 1
    assert dispatched == [response.json()["id"]]

    queued = persisted_job(client, session_factory, project_payload)
    response = client.post(f"/api/v1/jobs/{queued.id}/retry")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "state_conflict"

    exhausted = persisted_job(
        client,
        session_factory,
        project_payload,
        status=JobStatus.FAILED,
        retry_count=2,
        max_retries=2,
    )
    response = client.post(f"/api/v1/jobs/{exhausted.id}/retry")
    assert response.status_code == 409


def test_job_not_found_error(client: TestClient) -> None:
    response = client.get("/api/v1/jobs/job_missing")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "job_not_found"


def test_project_job_listing_restores_persisted_state(
    client: TestClient,
    session_factory: sessionmaker[Session],
    project_payload: dict[str, object],
) -> None:
    job = persisted_job(client, session_factory, project_payload)
    response = client.get(
        "/api/v1/jobs",
        params={"project_id": job.project_id, "active_only": True},
    )
    assert response.status_code == 200
    assert [item["id"] for item in response.json()["items"]] == [job.id]


def test_parent_cancellation_propagates_to_active_children(
    client: TestClient,
    session_factory: sessionmaker[Session],
    project_payload: dict[str, object],
) -> None:
    project = client.post("/api/v1/projects", json=project_payload).json()
    with session_factory() as session:
        persisted_project = session.get(Project, project["id"])
        assert persisted_project is not None
        parent = GenerationJob(
            user_id=persisted_project.user_id,
            project_id=project["id"],
            type=JobType.PROJECT_GENERATION,
            status=JobStatus.RUNNING,
            progress=0,
            current_stage="0_of_1_scenes_complete",
            input_payload={},
        )
        session.add(parent)
        session.flush()
        child = GenerationJob(
            user_id=persisted_project.user_id,
            project_id=project["id"],
            parent_job_id=parent.id,
            type=JobType.SCENE_GENERATION,
            status=JobStatus.RUNNING,
            progress=25,
            current_stage="creating_scene_keyframe",
            input_payload={},
        )
        session.add(child)
        session.commit()
        parent_id = parent.id
        child_id = child.id

    cancelled = client.post(f"/api/v1/jobs/{parent_id}/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancel_requested"
    child_after = client.get(f"/api/v1/jobs/{child_id}").json()
    assert child_after["status"] == "cancel_requested"


def test_abandoned_queued_job_cleanup_preserves_history(
    client: TestClient,
    session_factory: sessionmaker[Session],
    project_payload: dict[str, object],
    monkeypatch,
) -> None:
    job = persisted_job(client, session_factory, project_payload)
    with session_factory() as session:
        stored = session.get(GenerationJob, job.id)
        assert stored is not None
        stored.created_at = utc_now() - timedelta(hours=2)
        stored.updated_at = stored.created_at
        session.commit()

    @contextmanager
    def test_session_scope() -> Iterator[Session]:
        with session_factory() as session:
            yield session

    monkeypatch.setattr(system_tasks, "session_scope", test_session_scope)
    monkeypatch.setattr(
        system_tasks.settings,
        "queued_job_timeout_seconds",
        60,
    )
    result = system_tasks.cleanup_abandoned_jobs.run()
    assert result == {"cleaned": 1}
    cleaned = client.get(f"/api/v1/jobs/{job.id}").json()
    assert cleaned["status"] == "failed"
    assert cleaned["error_code"] == "job_heartbeat_timeout"
