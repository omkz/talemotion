from datetime import datetime

from pydantic import Field

from app.models.scene import Scene, SceneStatus
from app.schemas.common import NonEmptyText, StrictSchema


class CreateSceneRequest(StrictSchema):
    title: NonEmptyText
    narration: str
    visual_prompt: str
    duration_seconds: int = Field(gt=0, le=60)
    position: int | None = Field(default=None, ge=1)


class UpdateSceneRequest(StrictSchema):
    title: NonEmptyText | None = None
    narration: str | None = None
    visual_prompt: str | None = None
    duration_seconds: int | None = Field(default=None, gt=0, le=60)


class ReorderScenesRequest(StrictSchema):
    scene_ids: list[str]


class SceneResponse(StrictSchema):
    id: str
    chapter_id: str
    title: str
    narration: str
    visual_prompt: str
    duration_seconds: int
    position: int
    status: SceneStatus
    active_asset_id: str | None
    active_asset_version: int
    created_at: datetime
    updated_at: datetime


def scene_to_response(scene: Scene) -> SceneResponse:
    return SceneResponse(
        id=scene.id,
        chapter_id=scene.chapter_id,
        title=scene.title,
        narration=scene.narration,
        visual_prompt=scene.visual_prompt,
        duration_seconds=scene.duration_seconds,
        position=scene.position,
        status=scene.status,
        active_asset_id=scene.active_asset_id,
        active_asset_version=scene.active_asset_version,
        created_at=scene.created_at,
        updated_at=scene.updated_at,
    )
