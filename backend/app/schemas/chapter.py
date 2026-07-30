from datetime import datetime

from pydantic import Field

from app.models.chapter import Chapter, ChapterStatus
from app.schemas.common import StrictSchema
from app.schemas.scene import SceneResponse


class ChapterResponse(StrictSchema):
    id: str = Field(description="Opaque chapter identifier.")
    project_id: str
    title: str
    summary: str | None
    position: int
    target_duration_seconds: int
    status: ChapterStatus
    scenes: list[SceneResponse] = Field(description="Scenes ordered by position.")
    created_at: datetime
    updated_at: datetime


def chapter_to_response(chapter: Chapter) -> ChapterResponse:
    return ChapterResponse.model_validate(chapter.model_dump())
