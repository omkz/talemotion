from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field

from app.models.project import AspectRatio, Project, ProjectStatus, VideoMode
from app.schemas.chapter import ChapterResponse, chapter_to_response
from app.schemas.common import NonEmptyText, StrictSchema


class HistoricalDocumentaryBrief(StrictSchema):
    mode: Literal[VideoMode.HISTORICAL_DOCUMENTARY]
    topic: NonEmptyText
    additional_direction: str
    source_notes: str


class MicrodramaBrief(StrictSchema):
    mode: Literal[VideoMode.MICRODRAMA]
    premise: NonEmptyText
    main_character: NonEmptyText
    genre: NonEmptyText
    desired_ending: NonEmptyText


class ProductAdvertisementBrief(StrictSchema):
    mode: Literal[VideoMode.PRODUCT_ADVERTISEMENT]
    product_name: NonEmptyText
    product_description: NonEmptyText
    main_benefit: NonEmptyText
    target_audience: NonEmptyText
    call_to_action: NonEmptyText


ProjectBrief = Annotated[
    HistoricalDocumentaryBrief | MicrodramaBrief | ProductAdvertisementBrief,
    Field(discriminator="mode"),
]


class OutputConfiguration(StrictSchema):
    title: NonEmptyText
    language: Literal["English"]
    duration_seconds: Literal[30, 45]
    aspect_ratio: Literal[AspectRatio.VERTICAL]
    visual_style: NonEmptyText
    narration_style: NonEmptyText
    scene_count: Literal[4]
    captions_enabled: Literal[True]
    background_music_enabled: Literal[False] = False


class CreateProjectRequest(StrictSchema):
    mode: VideoMode
    brief: ProjectBrief
    output_config: OutputConfiguration
    template_id: str | None = None


class UpdateProjectRequest(StrictSchema):
    title: NonEmptyText | None = None
    brief: ProjectBrief | None = None
    output_config: OutputConfiguration | None = None
    historical_accuracy_note: str | None = None


class GenerateStoryboardRequest(StrictSchema):
    scene_count: Literal[4] | None = 4
    additional_instruction: str | None = None


class ProjectResponse(StrictSchema):
    id: str
    mode: VideoMode
    status: ProjectStatus
    brief: ProjectBrief
    output_config: OutputConfiguration
    chapters: list[ChapterResponse]
    thumbnail_url: str | None
    historical_accuracy_note: str | None
    generation_progress: int
    created_at: datetime
    updated_at: datetime


class ProjectListResponse(StrictSchema):
    items: list[ProjectResponse]
    next_cursor: str | None
    has_more: bool


def project_to_response(project: Project) -> ProjectResponse:
    return ProjectResponse(
        id=project.id,
        mode=project.mode,
        status=project.status,
        brief=HistoricalDocumentaryBrief(
            mode=VideoMode.HISTORICAL_DOCUMENTARY,
            topic=project.topic,
            additional_direction=project.additional_direction,
            source_notes=project.source_notes,
        ),
        output_config=OutputConfiguration(
            title=project.title,
            language="English",
            duration_seconds=project.duration_seconds,
            aspect_ratio=AspectRatio.VERTICAL,
            visual_style=project.visual_style,
            narration_style=project.narration_style,
            scene_count=4,
            captions_enabled=True,
            background_music_enabled=project.music_enabled,
        ),
        chapters=[chapter_to_response(chapter) for chapter in project.chapters],
        thumbnail_url=None,
        historical_accuracy_note=project.historical_accuracy_note,
        generation_progress=project.generation_progress,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )
