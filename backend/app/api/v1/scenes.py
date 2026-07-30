from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.repositories.interfaces import ProjectRepository
from app.repositories.memory import get_project_repository
from app.schemas.chapter import ChapterResponse, chapter_to_response
from app.schemas.common import ErrorResponse
from app.schemas.scene import (
    CreateSceneRequest,
    ReorderScenesRequest,
    SceneResponse,
    UpdateSceneRequest,
    scene_to_response,
)
from app.services.scenes import SceneService

router = APIRouter(tags=["Scenes"])
RepositoryDependency = Annotated[
    ProjectRepository,
    Depends(get_project_repository),
]

ERROR_RESPONSES = {
    404: {"model": ErrorResponse, "description": "Scene or chapter not found"},
    409: {"model": ErrorResponse, "description": "Parent project deleted"},
    422: {"model": ErrorResponse, "description": "Validation failed"},
}


@router.post(
    "/chapters/{chapter_id}/scenes",
    response_model=SceneResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a scene",
    description="Appends or inserts a draft scene and normalizes positions.",
    responses=ERROR_RESPONSES,
)
def create_scene(
    chapter_id: str,
    request: CreateSceneRequest,
    repository: RepositoryDependency,
) -> SceneResponse:
    scene = SceneService(repository).add_scene(chapter_id, request)
    return scene_to_response(scene)


@router.post(
    "/chapters/{chapter_id}/scenes/reorder",
    response_model=ChapterResponse,
    summary="Reorder scenes",
    description="Requires every current scene ID exactly once.",
    responses=ERROR_RESPONSES,
)
def reorder_scenes(
    chapter_id: str,
    request: ReorderScenesRequest,
    repository: RepositoryDependency,
) -> ChapterResponse:
    chapter = SceneService(repository).reorder_scenes(
        chapter_id,
        request.scene_ids,
    )
    return chapter_to_response(chapter)


@router.get(
    "/scenes/{scene_id}",
    response_model=SceneResponse,
    summary="Get a scene",
    responses=ERROR_RESPONSES,
)
def get_scene(
    scene_id: str,
    repository: RepositoryDependency,
) -> SceneResponse:
    return scene_to_response(SceneService(repository).get_scene(scene_id))


@router.patch(
    "/scenes/{scene_id}",
    response_model=SceneResponse,
    summary="Update a scene",
    description="Updates content fields; use the reorder endpoint for position.",
    responses=ERROR_RESPONSES,
)
def update_scene(
    scene_id: str,
    request: UpdateSceneRequest,
    repository: RepositoryDependency,
) -> SceneResponse:
    scene = SceneService(repository).update_scene(scene_id, request)
    return scene_to_response(scene)


@router.delete(
    "/scenes/{scene_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a scene",
    description="Removes the scene and closes remaining position gaps.",
    responses=ERROR_RESPONSES,
)
def delete_scene(
    scene_id: str,
    repository: RepositoryDependency,
) -> Response:
    SceneService(repository).delete_scene(scene_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/scenes/{scene_id}/duplicate",
    response_model=SceneResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Duplicate a scene",
    description="Creates a draft copy immediately after the source scene.",
    responses=ERROR_RESPONSES,
)
def duplicate_scene(
    scene_id: str,
    repository: RepositoryDependency,
) -> SceneResponse:
    scene = SceneService(repository).duplicate_scene(scene_id)
    return scene_to_response(scene)
