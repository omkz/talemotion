from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field

from app.models.project import (
    AspectRatio,
    Project,
    ProjectDuration,
    ProjectStatus,
    SceneCount,
    VideoMode,
)
from app.schemas.chapter import ChapterResponse
from app.schemas.common import NonEmptyText, StrictSchema


class HistoricalDocumentaryBriefSchema(StrictSchema):
    mode: Literal[VideoMode.HISTORICAL_DOCUMENTARY]
    topic: NonEmptyText
    additional_direction: str
    source_notes: str


class MicrodramaBriefSchema(StrictSchema):
    mode: Literal[VideoMode.MICRODRAMA]
    premise: NonEmptyText
    main_character: NonEmptyText
    genre: NonEmptyText
    desired_ending: NonEmptyText


class ProductAdvertisementBriefSchema(StrictSchema):
    mode: Literal[VideoMode.PRODUCT_ADVERTISEMENT]
    product_name: NonEmptyText
    product_description: NonEmptyText
    main_benefit: NonEmptyText
    target_audience: NonEmptyText
    call_to_action: NonEmptyText


ProjectBriefSchema = Annotated[
    HistoricalDocumentaryBriefSchema
    | MicrodramaBriefSchema
    | ProductAdvertisementBriefSchema,
    Field(discriminator="mode"),
]


class OutputConfigurationSchema(StrictSchema):
    title: NonEmptyText = Field(description="Display title for the generated video.")
    language: NonEmptyText
    duration: ProjectDuration = Field(description="Target video length in seconds.")
    aspect_ratio: AspectRatio = Field(description="Final video frame ratio.")
    visual_style: NonEmptyText
    narration_style: NonEmptyText
    scene_count: SceneCount
    captions_enabled: bool
    music_enabled: bool


class UpdateOutputConfigurationRequest(StrictSchema):
    title: NonEmptyText | None = None
    language: NonEmptyText | None = None
    duration: ProjectDuration | None = None
    aspect_ratio: AspectRatio | None = None
    visual_style: NonEmptyText | None = None
    narration_style: NonEmptyText | None = None
    scene_count: SceneCount | None = None
    captions_enabled: bool | None = None
    music_enabled: bool | None = None


class CreateProjectRequest(StrictSchema):
    mode: VideoMode = Field(description="TaleMotion content workflow.")
    brief: ProjectBriefSchema = Field(description="Mode-specific creative brief.")
    output: OutputConfigurationSchema = Field(
        description="Default output preferences for the project."
    )
    template_id: str | None = Field(
        default=None,
        description="Optional frontend template metadata; not resolved by the backend.",
    )
    historical_accuracy_note: str | None = None


class UpdateProjectRequest(StrictSchema):
    brief: ProjectBriefSchema | None = None
    output: UpdateOutputConfigurationRequest | None = None
    historical_accuracy_note: str | None = None


class ProjectResponse(StrictSchema):
    id: str = Field(description="Opaque project identifier.")
    mode: VideoMode
    status: ProjectStatus
    brief: ProjectBriefSchema
    output: OutputConfigurationSchema
    chapters: list[ChapterResponse] = Field(
        description="Internal chapters ordered by position."
    )
    template_id: str | None
    thumbnail_url: str | None
    historical_accuracy_note: str | None
    generation_progress: int
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class ProjectListResponse(StrictSchema):
    items: list[ProjectResponse]
    next_cursor: str | None
    has_more: bool


def project_to_response(project: Project) -> ProjectResponse:
    return ProjectResponse.model_validate(project.model_dump())
