from datetime import datetime

from pydantic import Field

from app.models.scene import Scene, SceneStatus
from app.schemas.common import NonEmptyText, StrictSchema


class CreateSceneRequest(StrictSchema):
    title: NonEmptyText = Field(description="Human-readable storyboard scene title.")
    narration: str
    visual_prompt: str
    duration_seconds: int = Field(
        gt=0,
        le=60,
        description="Planned scene duration, from 1 through 60 seconds.",
    )
    position: int | None = Field(
        default=None,
        ge=1,
        description="One-based insertion position; omitted values append.",
    )


class UpdateSceneRequest(StrictSchema):
    title: NonEmptyText | None = None
    narration: str | None = None
    visual_prompt: str | None = None
    duration_seconds: int | None = Field(default=None, gt=0, le=60)


class ReorderScenesRequest(StrictSchema):
    scene_ids: list[str]


class SceneResponse(StrictSchema):
    id: str = Field(description="Opaque scene identifier.")
    chapter_id: str
    title: str
    narration: str
    visual_prompt: str
    duration_seconds: int
    position: int
    status: SceneStatus = Field(description="Current scene lifecycle status.")
    created_at: datetime
    updated_at: datetime


def scene_to_response(scene: Scene) -> SceneResponse:
    return SceneResponse.model_validate(scene.model_dump())
