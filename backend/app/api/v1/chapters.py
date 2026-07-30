from typing import Annotated

from fastapi import APIRouter, Depends

from app.repositories.interfaces import ProjectRepository
from app.repositories.memory import get_project_repository
from app.schemas.chapter import ChapterResponse, chapter_to_response
from app.schemas.common import ErrorResponse
from app.services.scenes import SceneService

router = APIRouter(prefix="/chapters", tags=["Chapters"])
RepositoryDependency = Annotated[
    ProjectRepository,
    Depends(get_project_repository),
]


@router.get(
    "/{chapter_id}",
    response_model=ChapterResponse,
    summary="Get a chapter",
    description="Returns an internal project chapter and its ordered scenes.",
    responses={
        404: {"model": ErrorResponse, "description": "Chapter not found"},
        409: {"model": ErrorResponse, "description": "Parent project deleted"},
    },
)
def get_chapter(
    chapter_id: str,
    repository: RepositoryDependency,
) -> ChapterResponse:
    chapter = SceneService(repository).get_chapter(chapter_id)
    return chapter_to_response(chapter)
