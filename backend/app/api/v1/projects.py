from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.api.dependencies import DatabaseSession
from app.models.project import ProjectStatus, VideoMode
from app.repositories.sqlalchemy import ProjectRepository
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
ERROR_RESPONSES = {
    400: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    409: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
}


def _projects(session: DatabaseSession) -> ProjectService:
    return ProjectService(ProjectRepository(session))


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
