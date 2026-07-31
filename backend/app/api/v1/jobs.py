from fastapi import APIRouter, Query

from app.api.dependencies import DatabaseSession
from app.core.errors import ApiError
from app.models.job import JobType
from app.repositories.sqlalchemy import (
    JobRepository,
    ProjectRepository,
    RenderRepository,
)
from app.schemas.common import ErrorResponse
from app.schemas.job import (
    GenerationJobListResponse,
    GenerationJobResponse,
    job_to_response,
)
from app.services.jobs import JobService
from app.tasks.media import generate_scene_media
from app.tasks.rendering import render_project_video
from app.tasks.storyboard import generate_project_storyboard

router = APIRouter(prefix="/jobs", tags=["Jobs"])
ERROR_RESPONSES = {
    404: {"model": ErrorResponse},
    409: {"model": ErrorResponse},
    503: {"model": ErrorResponse},
}


def _jobs(session: DatabaseSession) -> JobService:
    return JobService(
        JobRepository(session),
        ProjectRepository(session),
        RenderRepository(session),
    )


@router.get(
    "",
    response_model=GenerationJobListResponse,
    summary="List persisted jobs for a project",
    responses=ERROR_RESPONSES,
)
def list_jobs(
    session: DatabaseSession,
    project_id: str = Query(min_length=1),
    active_only: bool = False,
) -> GenerationJobListResponse:
    return GenerationJobListResponse(
        items=[
            job_to_response(job)
            for job in _jobs(session).list_project_jobs(
                project_id,
                active_only=active_only,
            )
        ]
    )


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
    service = _jobs(session)
    job = service.retry(job_id)
    try:
        if job.type in {JobType.SCENE_GENERATION, JobType.SCENE_REGENERATION}:
            generate_scene_media.apply_async(
                args=[job.id], queue="media", task_id=job.id
            )
        elif job.type is JobType.STORYBOARD:
            generate_project_storyboard.apply_async(
                args=[job.id], queue="storyboard", task_id=job.id
            )
        elif job.type is JobType.RENDER:
            render_project_video.apply_async(
                args=[job.id], queue="rendering", task_id=job.id
            )
        elif job.type is JobType.PROJECT_GENERATION:
            for child in job.children:
                generate_scene_media.apply_async(
                    args=[child.id],
                    queue="media",
                    task_id=child.id,
                )
    except Exception as error:
        service.mark_queue_failure(job.id)
        for child in job.children:
            service.mark_queue_failure(child.id)
        raise ApiError(
            status_code=503,
            code="dependency_unavailable",
            message="The media worker queue is unavailable.",
            details={"job_id": job.id},
        ) from error
    return job_to_response(job)
