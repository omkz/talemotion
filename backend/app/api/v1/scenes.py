from fastapi import APIRouter, Response, status

from app.api.dependencies import DatabaseSession
from app.core.errors import ApiError
from app.repositories.sqlalchemy import JobRepository, ProjectRepository
from app.schemas.chapter import ChapterResponse, chapter_to_response
from app.schemas.common import ErrorResponse
from app.schemas.job import GenerationJobResponse, job_to_response
from app.schemas.scene import (
    CreateSceneRequest,
    ReorderScenesRequest,
    SceneResponse,
    UpdateSceneRequest,
    scene_to_response,
)
from app.schemas.scene_generation import CreateSceneGenerationRequest
from app.services.scene_generation import SceneGenerationService
from app.services.scenes import SceneService
from app.tasks.media import generate_scene_media

router = APIRouter(tags=["Scenes"])
ERROR_RESPONSES = {
    404: {"model": ErrorResponse},
    409: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
}


def _scenes(session: DatabaseSession) -> SceneService:
    return SceneService(ProjectRepository(session))


def _generation(session: DatabaseSession) -> SceneGenerationService:
    return SceneGenerationService(
        ProjectRepository(session),
        JobRepository(session),
    )


def enqueue_scene_media(job_id: str) -> None:
    generate_scene_media.apply_async(args=[job_id], queue="media")


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


@router.post(
    "/scenes/{scene_id}/generations",
    response_model=GenerationJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    responses=ERROR_RESPONSES,
    summary="Queue real image and video generation for a persisted scene",
)
def create_scene_generation(
    scene_id: str,
    request: CreateSceneGenerationRequest,
    session: DatabaseSession,
) -> GenerationJobResponse:
    service = _generation(session)
    job = service.queue(scene_id, request)
    try:
        enqueue_scene_media(job.id)
    except Exception as error:
        service.mark_dispatch_failed(job.id)
        raise ApiError(
            status_code=503,
            code="dependency_unavailable",
            message="The media worker queue is unavailable.",
            details={"job_id": job.id},
        ) from error
    return job_to_response(job)
