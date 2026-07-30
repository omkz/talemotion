from datetime import datetime

from pydantic import Field

from app.models.project import AspectRatio, Project, ProjectStatus, VideoMode
from app.schemas.chapter import ChapterResponse, chapter_to_response
from app.schemas.common import NonEmptyText, StrictSchema


class CreateProjectRequest(StrictSchema):
    mode: VideoMode
    title: NonEmptyText
    topic: NonEmptyText
    additional_direction: str = ""
    language: str = Field(default="en", min_length=2, max_length=32)
    duration_seconds: int = Field(default=45)
    aspect_ratio: AspectRatio = AspectRatio.VERTICAL
    visual_style: NonEmptyText = "cinematic historical realism"
    narration_style: NonEmptyText = "dramatic documentary"
    captions_enabled: bool = True
    music_enabled: bool = True
    historical_accuracy_note: str | None = None


class UpdateProjectRequest(StrictSchema):
    title: NonEmptyText | None = None
    topic: NonEmptyText | None = None
    additional_direction: str | None = None
    language: str | None = Field(default=None, min_length=2, max_length=32)
    duration_seconds: int | None = None
    aspect_ratio: AspectRatio | None = None
    visual_style: NonEmptyText | None = None
    narration_style: NonEmptyText | None = None
    captions_enabled: bool | None = None
    music_enabled: bool | None = None
    historical_accuracy_note: str | None = None


class ProjectResponse(StrictSchema):
    id: str
    mode: VideoMode
    status: ProjectStatus
    title: str
    topic: str
    additional_direction: str
    language: str
    duration_seconds: int
    aspect_ratio: AspectRatio
    visual_style: str
    narration_style: str
    captions_enabled: bool
    music_enabled: bool
    historical_accuracy_note: str | None
    generation_progress: int
    chapters: list[ChapterResponse]
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
        title=project.title,
        topic=project.topic,
        additional_direction=project.additional_direction,
        language=project.language,
        duration_seconds=project.duration_seconds,
        aspect_ratio=project.aspect_ratio,
        visual_style=project.visual_style,
        narration_style=project.narration_style,
        captions_enabled=project.captions_enabled,
        music_enabled=project.music_enabled,
        historical_accuracy_note=project.historical_accuracy_note,
        generation_progress=project.generation_progress,
        chapters=[chapter_to_response(chapter) for chapter in project.chapters],
        created_at=project.created_at,
        updated_at=project.updated_at,
    )
