from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status

from app.models.project import ProjectStatus, VideoMode
from app.repositories.interfaces import ProjectRepository
from app.repositories.memory import get_project_repository
from app.schemas.common import ErrorResponse
from app.schemas.project import (
    CreateProjectRequest,
    ProjectListResponse,
    ProjectResponse,
    UpdateProjectRequest,
    project_to_response,
)
from app.services.projects import ProjectService

router = APIRouter(prefix="/projects", tags=["Projects"])
RepositoryDependency = Annotated[
    ProjectRepository,
    Depends(get_project_repository),
]

ERROR_RESPONSES = {
    400: {"model": ErrorResponse, "description": "Invalid request"},
    404: {"model": ErrorResponse, "description": "Project not found"},
    409: {"model": ErrorResponse, "description": "Project state conflict"},
    422: {"model": ErrorResponse, "description": "Validation failed"},
}


def _service(repository: RepositoryDependency) -> ProjectService:
    return ProjectService(repository)


@router.get(
    "",
    response_model=ProjectListResponse,
    summary="List projects",
    description="Returns an opaque cursor-paginated project collection.",
    responses=ERROR_RESPONSES,
)
def list_projects(
    repository: RepositoryDependency,
    project_status: Annotated[ProjectStatus | None, Query(alias="status")] = None,
    mode: VideoMode | None = None,
    search: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: str | None = None,
) -> ProjectListResponse:
    page = _service(repository).list_projects(
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
    summary="Create a project",
    description="Creates a draft project with one internal Main chapter.",
    responses=ERROR_RESPONSES,
)
def create_project(
    request: CreateProjectRequest,
    repository: RepositoryDependency,
) -> ProjectResponse:
    project = _service(repository).create_project(request)
    return project_to_response(project)


@router.get(
    "/{project_id}",
    response_model=ProjectResponse,
    summary="Get a project",
    description="Returns project metadata, its chapters, and ordered scenes.",
    responses=ERROR_RESPONSES,
)
def get_project(
    project_id: str,
    repository: RepositoryDependency,
) -> ProjectResponse:
    return project_to_response(_service(repository).get_project(project_id))


@router.patch(
    "/{project_id}",
    response_model=ProjectResponse,
    summary="Update a project",
    description="Updates only client-editable brief and output preferences.",
    responses=ERROR_RESPONSES,
)
def update_project(
    project_id: str,
    request: UpdateProjectRequest,
    repository: RepositoryDependency,
) -> ProjectResponse:
    project = _service(repository).update_project(project_id, request)
    return project_to_response(project)


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft-delete a project",
    description="Marks the project deleted while retaining process-local data.",
    responses=ERROR_RESPONSES,
)
def delete_project(
    project_id: str,
    repository: RepositoryDependency,
) -> Response:
    _service(repository).soft_delete_project(project_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
