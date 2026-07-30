from app.models.chapter import Chapter
from app.schemas.common import StrictSchema
from app.schemas.scene import SceneResponse, scene_to_response


class ChapterResponse(StrictSchema):
    id: str
    project_id: str
    title: str
    position: int
    scenes: list[SceneResponse]


def chapter_to_response(chapter: Chapter) -> ChapterResponse:
    return ChapterResponse(
        id=chapter.id,
        project_id=chapter.project_id,
        title=chapter.title,
        position=chapter.position,
        scenes=[scene_to_response(scene) for scene in chapter.scenes],
    )
