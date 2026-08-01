from typing import Annotated, Literal

from pydantic import Field, field_validator

from app.schemas.common import NonEmptyText, StrictSchema


class SceneRunRequest(StrictSchema):
    project_id: NonEmptyText = Field(max_length=200)
    scene_id: NonEmptyText = Field(max_length=200)
    title: NonEmptyText = Field(max_length=200)
    visual_prompt: NonEmptyText = Field(max_length=4000)
    aspect_ratio: Literal["9:16", "16:9"]
    duration_seconds: int = Field(ge=1, le=60)
    generate_video: bool = True

    @field_validator("project_id", "scene_id", "title", "visual_prompt")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()


class SceneRunAsset(StrictSchema):
    kind: Literal["image", "video"]
    media_type: str
    asset_url: str
    sha256: str
    storage_object_key: str
    file_size_bytes: int | None = None
    provider: NonEmptyText
    model: str


class SceneRunStartedEvent(StrictSchema):
    type: Literal["scene_run.started"] = "scene_run.started"
    run_id: str
    project_id: str
    scene_id: str


class SceneImageStartedEvent(StrictSchema):
    type: Literal["scene_image.started"] = "scene_image.started"
    run_id: str
    project_id: str
    scene_id: str
    model: str


class SceneImageProgressEvent(StrictSchema):
    type: Literal["scene_image.progress"] = "scene_image.progress"
    run_id: str
    project_id: str
    scene_id: str
    progress: float | None = Field(default=None, ge=0, le=100)
    elapsed_seconds: float | None = Field(default=None, ge=0)
    message: str | None = None


class SceneImageCompletedEvent(StrictSchema):
    type: Literal["scene_image.completed"] = "scene_image.completed"
    run_id: str
    project_id: str
    scene_id: str
    asset: SceneRunAsset
    manifest_url: str
    manifest_object_key: str


class SceneVideoStartedEvent(StrictSchema):
    type: Literal["scene_video.started"] = "scene_video.started"
    run_id: str
    project_id: str
    scene_id: str
    model: str


class SceneVideoProgressEvent(StrictSchema):
    type: Literal["scene_video.progress"] = "scene_video.progress"
    run_id: str
    project_id: str
    scene_id: str
    progress: float | None = Field(default=None, ge=0, le=100)
    elapsed_seconds: float | None = Field(default=None, ge=0)
    message: str | None = None


class SceneVideoCompletedEvent(StrictSchema):
    type: Literal["scene_video.completed"] = "scene_video.completed"
    run_id: str
    project_id: str
    scene_id: str
    asset: SceneRunAsset
    manifest_url: str
    manifest_object_key: str


class SceneRunCompletedEvent(StrictSchema):
    type: Literal["scene_run.completed"] = "scene_run.completed"
    run_id: str
    project_id: str
    scene_id: str
    image: SceneRunAsset
    video: SceneRunAsset | None
    manifest_url: str
    manifest_object_key: str


class SceneRunFailedEvent(StrictSchema):
    type: Literal["scene_run.failed"] = "scene_run.failed"
    run_id: str
    project_id: str
    scene_id: str
    code: Literal[
        "missing_configuration",
        "provider_authentication_failed",
        "provider_rate_limited",
        "provider_generation_failed",
        "provider_timeout",
        "unsupported_parameters",
        "storage_failed",
        "invalid_request",
        "unknown_error",
    ]
    message: str
    retryable: bool
    image: SceneRunAsset | None = None


type SceneRunEvent = Annotated[
    SceneRunStartedEvent
    | SceneImageStartedEvent
    | SceneImageProgressEvent
    | SceneImageCompletedEvent
    | SceneVideoStartedEvent
    | SceneVideoProgressEvent
    | SceneVideoCompletedEvent
    | SceneRunCompletedEvent
    | SceneRunFailedEvent,
    Field(discriminator="type"),
]
