from fastapi import APIRouter, Response, status

from app.api.dependencies import DatabaseSession, JobDispatcherDependency
from app.core.config import settings
from app.repositories.sqlalchemy import (
    AssetRepository,
    JobRepository,
    ProjectRepository,
    RenderRepository,
)
from app.schemas.chapter import ChapterResponse, chapter_to_response
from app.schemas.common import ErrorResponse
from app.schemas.job import GenerationJobResponse, job_to_response
from app.schemas.scene import (
    CreateSceneRequest,
    GenerateSceneRequest,
    RegenerateSceneRequest,
    ReorderScenesRequest,
    SceneResponse,
    UpdateSceneRequest,
    scene_to_response,
)
from app.services.generation import GenerationService
from app.services.scenes import SceneService

router = APIRouter(tags=["Scenes"])
ERROR_RESPONSES = {
    404: {"model": ErrorResponse, "description": "Scene or chapter not found"},
    409: {"model": ErrorResponse, "description": "Resource state conflict"},
    422: {"model": ErrorResponse, "description": "Validation failed"},
    503: {"model": ErrorResponse, "description": "Provider or B2 not configured"},
}


def _scenes(session: DatabaseSession) -> SceneService:
    return SceneService(ProjectRepository(session))


def _generation(
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


@router.post(
    "/chapters/{chapter_id}/scenes",
    response_model=SceneResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a scene",
    responses=ERROR_RESPONSES,
)
def create_scene(
    chapter_id: str,
    request: CreateSceneRequest,
    session: DatabaseSession,
) -> SceneResponse:
    return scene_to_response(_scenes(session).add_scene(chapter_id, request))


@router.post(
    "/chapters/{chapter_id}/scenes/reorder",
    response_model=ChapterResponse,
    summary="Reorder scenes",
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
    "/scenes/{scene_id}",
    response_model=SceneResponse,
    summary="Get a scene",
    responses=ERROR_RESPONSES,
)
def get_scene(scene_id: str, session: DatabaseSession) -> SceneResponse:
    return scene_to_response(_scenes(session).get_scene(scene_id))


@router.patch(
    "/scenes/{scene_id}",
    response_model=SceneResponse,
    summary="Update a scene",
    responses=ERROR_RESPONSES,
)
def update_scene(
    scene_id: str,
    request: UpdateSceneRequest,
    session: DatabaseSession,
) -> SceneResponse:
    return scene_to_response(_scenes(session).update_scene(scene_id, request))


@router.delete(
    "/scenes/{scene_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a scene",
    responses=ERROR_RESPONSES,
)
def delete_scene(scene_id: str, session: DatabaseSession) -> Response:
    _scenes(session).delete_scene(scene_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/scenes/{scene_id}/duplicate",
    response_model=SceneResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Duplicate a scene",
    responses=ERROR_RESPONSES,
)
def duplicate_scene(scene_id: str, session: DatabaseSession) -> SceneResponse:
    return scene_to_response(_scenes(session).duplicate_scene(scene_id))


@router.post(
    "/scenes/{scene_id}/generations",
    response_model=GenerationJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Queue real scene image generation",
    responses=ERROR_RESPONSES,
)
def generate_scene(
    scene_id: str,
    request: GenerateSceneRequest,
    session: DatabaseSession,
    dispatcher: JobDispatcherDependency,
) -> GenerationJobResponse:
    job = _generation(session, dispatcher).queue_scene(
        scene_id,
        instruction=request.additional_instruction,
        regeneration=False,
    )
    return job_to_response(job)


@router.post(
    "/scenes/{scene_id}/regenerations",
    response_model=GenerationJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Queue a new scene asset version",
    responses=ERROR_RESPONSES,
)
def regenerate_scene(
    scene_id: str,
    request: RegenerateSceneRequest,
    session: DatabaseSession,
    dispatcher: JobDispatcherDependency,
) -> GenerationJobResponse:
    job = _generation(session, dispatcher).queue_scene(
        scene_id,
        instruction=request.additional_instruction,
        regeneration=True,
    )
    return job_to_response(job)
