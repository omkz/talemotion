from fastapi import APIRouter

from app.api.dependencies import DatabaseSession
from app.repositories.sqlalchemy import JobRepository
from app.schemas.common import ErrorResponse
from app.schemas.job import GenerationJobResponse, job_to_response
from app.services.jobs import JobService

router = APIRouter(prefix="/jobs", tags=["Jobs"])
ERROR_RESPONSES = {
    404: {"model": ErrorResponse},
    409: {"model": ErrorResponse},
    501: {"model": ErrorResponse},
}


def _jobs(session: DatabaseSession) -> JobService:
    return JobService(JobRepository(session))


@router.get(
    "/{job_id}",
    response_model=GenerationJobResponse,
    summary="Inspect a persisted job",
    responses=ERROR_RESPONSES,
)
def get_job(job_id: str, session: DatabaseSession) -> GenerationJobResponse:
    return job_to_response(_jobs(session).get_job(job_id))


@router.post(
    "/{job_id}/cancel",
    response_model=GenerationJobResponse,
    summary="Request cancellation",
    responses=ERROR_RESPONSES,
)
def cancel_job(job_id: str, session: DatabaseSession) -> GenerationJobResponse:
    return job_to_response(_jobs(session).request_cancellation(job_id))


@router.post(
    "/{job_id}/retry",
    response_model=GenerationJobResponse,
    summary="Check retry eligibility",
    responses=ERROR_RESPONSES,
)
def retry_job(job_id: str, session: DatabaseSession) -> GenerationJobResponse:
    return job_to_response(_jobs(session).retry(job_id))
