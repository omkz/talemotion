from fastapi import APIRouter

from app.api.dependencies import DatabaseSession, JobDispatcherDependency
from app.core.config import settings
from app.repositories.sqlalchemy import (
    AssetRepository,
    JobRepository,
    ProjectRepository,
    RenderRepository,
)
from app.schemas.common import ErrorResponse
from app.schemas.job import GenerationJobResponse, job_to_response
from app.services.generation import GenerationService

router = APIRouter(prefix="/jobs", tags=["Jobs"])


@router.get(
    "/{job_id}",
    response_model=GenerationJobResponse,
    summary="Poll a durable generation job",
    responses={404: {"model": ErrorResponse, "description": "Job not found"}},
)
def get_job(
    job_id: str,
    session: DatabaseSession,
    dispatcher: JobDispatcherDependency,
) -> GenerationJobResponse:
    service = GenerationService(
        projects=ProjectRepository(session),
        jobs=JobRepository(session),
        assets=AssetRepository(session),
        renders=RenderRepository(session),
        dispatcher=dispatcher,
        config=settings,
    )
    return job_to_response(service.get_job(job_id))
