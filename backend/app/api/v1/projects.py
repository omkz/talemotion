from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.api.dependencies import (
    DatabaseSession,
    JobDispatcherDependency,
    StorageDependency,
)
from app.core.config import settings
from app.models.project import ProjectStatus, VideoMode
from app.repositories.sqlalchemy import (
    AssetRepository,
    JobRepository,
    ProjectRepository,
    RenderRepository,
)
from app.schemas.common import ErrorResponse
from app.schemas.job import GenerationJobResponse, job_to_response
from app.schemas.project import (
    CreateProjectRequest,
    GenerateStoryboardRequest,
    ProjectListResponse,
    ProjectResponse,
    UpdateProjectRequest,
    project_to_response,
)
from app.schemas.render import (
    CreateRenderRequest,
    RenderListResponse,
    render_to_response,
)
from app.services.generation import GenerationService
from app.services.projects import ProjectService

router = APIRouter(prefix="/projects", tags=["Projects"])
ERROR_RESPONSES = {
    400: {"model": ErrorResponse, "description": "Invalid request"},
    404: {"model": ErrorResponse, "description": "Project not found"},
    409: {"model": ErrorResponse, "description": "Project state conflict"},
    422: {"model": ErrorResponse, "description": "Validation failed"},
    503: {"model": ErrorResponse, "description": "Provider not configured"},
}


def _project_service(session: DatabaseSession) -> ProjectService:
    return ProjectService(ProjectRepository(session))


def _generation_service(
    session: DatabaseSession,
    dispatcher: JobDispatcherDependency,
) -> GenerationService:
    return GenerationService(
        projects=ProjectRepository(session),
        jobs=JobRepository(session),
        assets=AssetRepository(session),
        renders=RenderRepository(session),
        dispatcher=dispatcher,
        config=settings,
    )


@router.get(
    "",
    response_model=ProjectListResponse,
    summary="List projects",
    responses=ERROR_RESPONSES,
)
def list_projects(
    session: DatabaseSession,
    project_status: Annotated[ProjectStatus | None, Query(alias="status")] = None,
    mode: VideoMode | None = None,
    search: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: str | None = None,
) -> ProjectListResponse:
    page = _project_service(session).list_projects(
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
    summary="Create a historical documentary project",
    description="Persists the project and its default Main chapter in PostgreSQL.",
    responses=ERROR_RESPONSES,
)
def create_project(
    request: CreateProjectRequest,
    session: DatabaseSession,
) -> ProjectResponse:
    return project_to_response(_project_service(session).create_project(request))


@router.get(
    "/{project_id}",
    response_model=ProjectResponse,
    summary="Get a project",
    responses=ERROR_RESPONSES,
)
def get_project(project_id: str, session: DatabaseSession) -> ProjectResponse:
    return project_to_response(_project_service(session).get_project(project_id))


@router.patch(
    "/{project_id}",
    response_model=ProjectResponse,
    summary="Update a project",
    responses=ERROR_RESPONSES,
)
def update_project(
    project_id: str,
    request: UpdateProjectRequest,
    session: DatabaseSession,
) -> ProjectResponse:
    return project_to_response(
        _project_service(session).update_project(project_id, request)
    )


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft-delete a project",
    responses=ERROR_RESPONSES,
)
def delete_project(project_id: str, session: DatabaseSession) -> Response:
    _project_service(session).soft_delete_project(project_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{project_id}/storyboard",
    response_model=GenerationJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Queue real storyboard generation",
    description="Creates a durable job and enqueues Genblaze text generation.",
    responses=ERROR_RESPONSES,
)
def generate_storyboard(
    project_id: str,
    request: GenerateStoryboardRequest,
    session: DatabaseSession,
    dispatcher: JobDispatcherDependency,
) -> GenerationJobResponse:
    job = _generation_service(session, dispatcher).queue_storyboard(
        project_id,
        additional_instruction=request.additional_instruction,
    )
    return job_to_response(job)


@router.post(
    "/{project_id}/renders",
    response_model=GenerationJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Queue final MP4 rendering",
    responses=ERROR_RESPONSES,
)
def create_render(
    project_id: str,
    request: CreateRenderRequest,
    session: DatabaseSession,
    dispatcher: JobDispatcherDependency,
) -> GenerationJobResponse:
    job = _generation_service(session, dispatcher).queue_render(
        project_id,
        captions_enabled=request.captions_enabled,
        music_enabled=request.background_music_enabled,
        resolution=request.resolution,
    )
    return job_to_response(job)


@router.get(
    "/{project_id}/renders",
    response_model=RenderListResponse,
    summary="List final renders for a project",
    responses=ERROR_RESPONSES,
)
def list_renders(
    project_id: str,
    session: DatabaseSession,
    storage: StorageDependency,
) -> RenderListResponse:
    _project_service(session).get_project(project_id)
    responses = []
    for render in RenderRepository(session).list_for_project(project_id):
        preview_url = None
        if render.b2_object_key:
            preview_url, _expires_at = storage.signed_url(render.b2_object_key)
        responses.append(render_to_response(render, preview_url=preview_url))
    return RenderListResponse(items=responses)
