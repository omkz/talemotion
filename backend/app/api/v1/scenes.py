from fastapi import APIRouter, Response, status

from app.api.dependencies import DatabaseSession
from app.repositories.sqlalchemy import ProjectRepository
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
ERROR_RESPONSES = {
    404: {"model": ErrorResponse},
    409: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
}


def _scenes(session: DatabaseSession) -> SceneService:
    return SceneService(ProjectRepository(session))


@router.post(
    "/chapters/{chapter_id}/scenes",
    response_model=SceneResponse,
    status_code=status.HTTP_201_CREATED,
    responses=ERROR_RESPONSES,
)
def create_scene(
    chapter_id: str, request: CreateSceneRequest, session: DatabaseSession
) -> SceneResponse:
    return scene_to_response(_scenes(session).add_scene(chapter_id, request))


@router.post(
    "/chapters/{chapter_id}/scenes/reorder",
    response_model=ChapterResponse,
    responses=ERROR_RESPONSES,
)
def reorder_scenes(
    chapter_id: str,
    request: ReorderScenesRequest,
    session: DatabaseSession,
) -> ChapterResponse:
    return chapter_to_response(
        _scenes(session).reorder_scenes(chapter_id, request.scene_ids)
    )


@router.get(
    "/scenes/{scene_id}", response_model=SceneResponse, responses=ERROR_RESPONSES
)
def get_scene(scene_id: str, session: DatabaseSession) -> SceneResponse:
    return scene_to_response(_scenes(session).get_scene(scene_id))


@router.patch(
    "/scenes/{scene_id}", response_model=SceneResponse, responses=ERROR_RESPONSES
)
def update_scene(
    scene_id: str, request: UpdateSceneRequest, session: DatabaseSession
) -> SceneResponse:
    return scene_to_response(_scenes(session).update_scene(scene_id, request))


@router.delete(
    "/scenes/{scene_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=ERROR_RESPONSES,
)
def delete_scene(scene_id: str, session: DatabaseSession) -> Response:
    _scenes(session).delete_scene(scene_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/scenes/{scene_id}/duplicate",
    response_model=SceneResponse,
    status_code=status.HTTP_201_CREATED,
    responses=ERROR_RESPONSES,
)
def duplicate_scene(scene_id: str, session: DatabaseSession) -> SceneResponse:
    return scene_to_response(_scenes(session).duplicate_scene(scene_id))
