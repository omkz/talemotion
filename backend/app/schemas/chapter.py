from datetime import datetime

from app.models.chapter import Chapter, ChapterStatus
from app.schemas.common import StrictSchema
from app.schemas.scene import SceneResponse, scene_to_response


class ChapterResponse(StrictSchema):
    id: str
    project_id: str
    title: str
    summary: str | None
    position: int
    target_duration_seconds: int | None
    status: ChapterStatus
    scenes: list[SceneResponse]
    created_at: datetime
    updated_at: datetime


def chapter_to_response(chapter: Chapter) -> ChapterResponse:
    return ChapterResponse(
        id=chapter.id,
        project_id=chapter.project_id,
        title=chapter.title,
        summary=chapter.summary,
        position=chapter.position,
        target_duration_seconds=chapter.target_duration_seconds,
        status=chapter.status,
        scenes=[scene_to_response(scene) for scene in chapter.scenes],
        created_at=chapter.created_at,
        updated_at=chapter.updated_at,
    )
