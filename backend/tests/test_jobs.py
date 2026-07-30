from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.models.job import GenerationJob, JobStatus, JobType


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
        job = GenerationJob(
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


def test_job_retry_eligibility_is_explicitly_not_implemented(
    client: TestClient,
    session_factory: sessionmaker[Session],
    project_payload: dict[str, object],
) -> None:
    failed = persisted_job(
        client, session_factory, project_payload, status=JobStatus.FAILED
    )
    response = client.post(f"/api/v1/jobs/{failed.id}/retry")
    assert response.status_code == 501
    assert response.json()["error"]["code"] == "not_implemented"

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
