from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.api.dependencies import DatabaseSession
from app.core.errors import ApiError
from app.models.project import ProjectStatus, VideoMode
from app.repositories.sqlalchemy import JobRepository, ProjectRepository
from app.schemas.common import ErrorResponse
from app.schemas.job import GenerationJobResponse, job_to_response
from app.schemas.project import (
    CreateProjectRequest,
    ProjectListResponse,
    ProjectResponse,
    UpdateProjectRequest,
    project_to_response,
)
from app.schemas.storyboard import (
    CreateProjectGenerationRequest,
    CreateStoryboardRequest,
)
from app.services.project_generation import ProjectGenerationService
from app.services.projects import ProjectService
from app.tasks.media import generate_scene_media
from app.tasks.storyboard import generate_project_storyboard

router = APIRouter(prefix="/projects", tags=["Projects"])
ERROR_RESPONSES = {
    400: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    409: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
    503: {"model": ErrorResponse},
}


def _projects(session: DatabaseSession) -> ProjectService:
    return ProjectService(ProjectRepository(session))


def _generation(session: DatabaseSession) -> ProjectGenerationService:
    return ProjectGenerationService(
        ProjectRepository(session),
        JobRepository(session),
    )


def enqueue_storyboard(job_id: str) -> None:
    generate_project_storyboard.apply_async(args=[job_id], queue="storyboard")


def enqueue_project_children(job_ids: list[str]) -> None:
    for job_id in job_ids:
        generate_scene_media.apply_async(args=[job_id], queue="media")


@router.get("", response_model=ProjectListResponse, responses=ERROR_RESPONSES)
def list_projects(
    session: DatabaseSession,
    project_status: Annotated[ProjectStatus | None, Query(alias="status")] = None,
    mode: VideoMode | None = None,
    search: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: str | None = None,
) -> ProjectListResponse:
    page = _projects(session).list_projects(
        status=project_status,
        mode=mode,
        search=search,
        limit=limit,
        cursor=cursor,
    )
    return ProjectListResponse(
        items=[project_to_response(project) for project in page.items],
        next_cursor=page.next_cursor,
        has_more=page.has_more,
    )


@router.post(
    "",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a project and its Main chapter atomically",
    responses=ERROR_RESPONSES,
)
def create_project(
    request: CreateProjectRequest, session: DatabaseSession
) -> ProjectResponse:
    return project_to_response(_projects(session).create_project(request))


@router.get("/{project_id}", response_model=ProjectResponse, responses=ERROR_RESPONSES)
def get_project(project_id: str, session: DatabaseSession) -> ProjectResponse:
    return project_to_response(_projects(session).get_project(project_id))


@router.patch(
    "/{project_id}", response_model=ProjectResponse, responses=ERROR_RESPONSES
)
def update_project(
    project_id: str,
    request: UpdateProjectRequest,
    session: DatabaseSession,
) -> ProjectResponse:
    return project_to_response(_projects(session).update_project(project_id, request))


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=ERROR_RESPONSES,
)
def delete_project(project_id: str, session: DatabaseSession) -> Response:
    _projects(session).soft_delete_project(project_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{project_id}/storyboard",
    response_model=GenerationJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    responses=ERROR_RESPONSES,
)
def create_storyboard(
    project_id: str,
    request: CreateStoryboardRequest,
    session: DatabaseSession,
) -> GenerationJobResponse:
    service = _generation(session)
    job = service.queue_storyboard(project_id, request)
    try:
        enqueue_storyboard(job.id)
    except Exception as error:
        service.mark_queue_failure([job.id], project_id=project_id)
        raise ApiError(
            status_code=503,
            code="dependency_unavailable",
            message="The storyboard worker queue is unavailable.",
            details={"job_id": job.id},
        ) from error
    return job_to_response(job)


@router.post(
    "/{project_id}/generations",
    response_model=GenerationJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    responses=ERROR_RESPONSES,
)
def create_project_generation(
    project_id: str,
    request: CreateProjectGenerationRequest,
    session: DatabaseSession,
) -> GenerationJobResponse:
    service = _generation(session)
    queued = service.queue_all_scenes(project_id, request)
    try:
        enqueue_project_children([child.id for child in queued.children])
    except Exception as error:
        service.mark_queue_failure(
            [queued.parent.id, *[child.id for child in queued.children]],
            project_id=project_id,
        )
        raise ApiError(
            status_code=503,
            code="dependency_unavailable",
            message="The media worker queue is unavailable.",
            details={"job_id": queued.parent.id},
        ) from error
    return job_to_response(queued.parent)
