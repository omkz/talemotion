from datetime import datetime

from pydantic import Field

from app.models.scene import Scene, SceneStatus
from app.schemas.asset import AssetResponse, asset_to_response
from app.schemas.common import NonEmptyText, StrictSchema
from app.schemas.job import GenerationJobResponse, job_to_response


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


class GenerateSceneRequest(StrictSchema):
    stages: list[str] = Field(default_factory=lambda: ["image"])
    additional_instruction: str | None = None


class RegenerateSceneRequest(StrictSchema):
    additional_instruction: NonEmptyText
    stages: list[str] = Field(default_factory=lambda: ["image"])


class SceneVersionResponse(StrictSchema):
    version: int
    visual_prompt: str
    instruction: str | None
    asset: AssetResponse | None
    created_at: datetime


class SceneResponse(StrictSchema):
    id: str
    chapter_id: str
    position: int
    title: str
    narration: str
    visual_prompt: str
    duration_seconds: int
    status: SceneStatus
    active_version: int
    versions: list[SceneVersionResponse]
    current_job: GenerationJobResponse | None
    approved: bool
    created_at: datetime
    updated_at: datetime


def scene_to_response(scene: Scene) -> SceneResponse:
    assets = sorted(scene.assets, key=lambda asset: asset.version)
    versions = [
        SceneVersionResponse(
            version=asset.version,
            visual_prompt=asset.prompt or scene.visual_prompt,
            instruction=asset.generation_instruction,
            asset=asset_to_response(asset),
            created_at=asset.created_at,
        )
        for asset in assets
    ]
    if not versions:
        versions = [
            SceneVersionResponse(
                version=1,
                visual_prompt=scene.visual_prompt,
                instruction=None,
                asset=None,
                created_at=scene.created_at,
            )
        ]
    current_job = max(scene.jobs, key=lambda job: job.created_at, default=None)
    return SceneResponse(
        id=scene.id,
        chapter_id=scene.chapter_id,
        position=scene.position,
        title=scene.title,
        narration=scene.narration,
        visual_prompt=scene.visual_prompt,
        duration_seconds=scene.duration_seconds,
        status=scene.status,
        active_version=max(1, scene.active_asset_version),
        versions=versions,
        current_job=job_to_response(current_job) if current_job else None,
        approved=False,
        created_at=scene.created_at,
        updated_at=scene.updated_at,
    )
