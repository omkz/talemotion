from fastapi import APIRouter

from app.api.dependencies import CurrentAuth, DatabaseSession
from app.repositories.sqlalchemy import ProjectRepository
from app.schemas.chapter import ChapterResponse, chapter_to_response
from app.schemas.common import ErrorResponse
from app.services.scenes import SceneService

router = APIRouter(prefix="/chapters", tags=["Chapters"])


@router.get(
    "/{chapter_id}",
    response_model=ChapterResponse,
    summary="Get a chapter",
    responses={
        404: {"model": ErrorResponse, "description": "Chapter not found"},
        409: {"model": ErrorResponse, "description": "Parent project deleted"},
    },
)
def get_chapter(
    chapter_id: str,
    session: DatabaseSession,
    auth: CurrentAuth,
) -> ChapterResponse:
    chapter = SceneService(
        ProjectRepository(session, auth.user.id)
    ).get_chapter(chapter_id)
    return chapter_to_response(chapter)
