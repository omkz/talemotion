import re
from datetime import datetime

from pydantic import Field, field_validator, model_validator

from app.models.project import (
    AspectRatio,
    ContentType,
    Project,
    ProjectStatus,
    ProjectTone,
    VideoMode,
)
from app.schemas.chapter import ChapterResponse, chapter_to_response
from app.schemas.common import NonEmptyText, StrictSchema

HISTORICAL_CONTENT_TYPES = frozenset(
    {
        ContentType.DOCUMENTARY,
        ContentType.EDUCATIONAL,
        ContentType.EXPLAINER,
    }
)
_REQUIRED_UPDATE_FIELDS = frozenset(
    {
        "title",
        "topic",
        "content_type",
        "language",
        "tone",
        "target_audience",
        "additional_direction",
        "duration_seconds",
        "aspect_ratio",
        "visual_style",
        "narration_style",
        "captions_enabled",
        "narration_enabled",
        "music_enabled",
    }
)


def validate_historical_content_type(value: ContentType) -> ContentType:
    if value not in HISTORICAL_CONTENT_TYPES:
        raise ValueError(
            "Historical documentary projects support documentary, "
            "educational, or explainer content."
        )
    return value


class CreateProjectRequest(StrictSchema):
    mode: VideoMode
    title: str | None = Field(default=None, max_length=200)
    topic: NonEmptyText = Field(max_length=4000)
    source_notes: str | None = Field(default=None, max_length=12000)
    content_type: ContentType = ContentType.DOCUMENTARY
    tone: ProjectTone = ProjectTone.CINEMATIC
    target_audience: NonEmptyText = Field(
        default="General audience", max_length=200
    )
    additional_direction: str = Field(default="", max_length=4000)
    language: str = Field(default="en", min_length=2, max_length=32)
    duration_seconds: int = Field(default=45)
    aspect_ratio: AspectRatio = AspectRatio.VERTICAL
    visual_style: NonEmptyText | None = None
    narration_style: NonEmptyText | None = None
    captions_enabled: bool = False
    narration_enabled: bool = True
    music_enabled: bool = False
    historical_accuracy_note: str | None = None

    @field_validator("title", "source_notes", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        normalized = value.strip()
        return normalized or None

    @field_validator("additional_direction", mode="before")
    @classmethod
    def normalize_direction(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("language")
    @classmethod
    def validate_language(cls, value: str) -> str:
        return normalize_language_code(value)

    @model_validator(mode="after")
    def validate_mode_specific_fields(self) -> "CreateProjectRequest":
        if self.mode is VideoMode.HISTORICAL_DOCUMENTARY:
            validate_historical_content_type(self.content_type)
        return self


class UpdateProjectRequest(StrictSchema):
    title: NonEmptyText | None = Field(default=None, max_length=200)
    topic: NonEmptyText | None = Field(default=None, max_length=4000)
    source_notes: str | None = Field(default=None, max_length=12000)
    content_type: ContentType | None = None
    tone: ProjectTone | None = None
    target_audience: NonEmptyText | None = Field(default=None, max_length=200)
    additional_direction: str | None = Field(default=None, max_length=4000)
    language: str | None = Field(default=None, min_length=2, max_length=32)
    duration_seconds: int | None = None
    aspect_ratio: AspectRatio | None = None
    visual_style: NonEmptyText | None = None
    narration_style: NonEmptyText | None = None
    captions_enabled: bool | None = None
    narration_enabled: bool | None = None
    music_enabled: bool | None = None
    historical_accuracy_note: str | None = None

    @model_validator(mode="before")
    @classmethod
    def reject_null_required_fields(cls, value: object) -> object:
        if isinstance(value, dict):
            null_fields = sorted(
                field
                for field in _REQUIRED_UPDATE_FIELDS
                if field in value and value[field] is None
            )
            if null_fields:
                raise ValueError(
                    "These project fields cannot be null: "
                    + ", ".join(null_fields)
                    + "."
                )
        return value

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return " ".join(value.split())

    @field_validator("source_notes", mode="before")
    @classmethod
    def normalize_source_notes(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        normalized = value.strip()
        return normalized or None

    @field_validator("additional_direction", mode="before")
    @classmethod
    def normalize_update_direction(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("language")
    @classmethod
    def validate_optional_language(cls, value: str | None) -> str | None:
        return normalize_language_code(value) if value is not None else None

    @field_validator("content_type")
    @classmethod
    def validate_content_type(
        cls, value: ContentType | None
    ) -> ContentType | None:
        return (
            validate_historical_content_type(value)
            if value is not None
            else None
        )

class ProjectResponse(StrictSchema):
    id: str
    mode: VideoMode
    status: ProjectStatus
    title: str
    topic: str
    source_notes: str | None
    content_type: ContentType
    tone: ProjectTone
    target_audience: str
    additional_direction: str
    language: str
    duration_seconds: int
    aspect_ratio: AspectRatio
    visual_style: str
    narration_style: str
    captions_enabled: bool
    narration_enabled: bool
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
        source_notes=project.source_notes,
        content_type=project.content_type,
        tone=project.tone,
        target_audience=project.target_audience,
        additional_direction=project.additional_direction,
        language=project.language,
        duration_seconds=project.duration_seconds,
        aspect_ratio=project.aspect_ratio,
        visual_style=project.visual_style,
        narration_style=project.narration_style,
        captions_enabled=project.captions_enabled,
        narration_enabled=project.narration_enabled,
        music_enabled=project.music_enabled,
        historical_accuracy_note=project.historical_accuracy_note,
        generation_progress=project.generation_progress,
        chapters=[chapter_to_response(chapter) for chapter in project.chapters],
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


_LANGUAGE_CODE = re.compile(
    r"^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"
)


def normalize_language_code(value: str) -> str:
    normalized = value.strip()
    legacy_labels = {
        "english": "en",
        "indonesian": "id",
        "dutch": "nl",
        "german": "de",
        "french": "fr",
        "spanish": "es",
    }
    normalized = legacy_labels.get(normalized.lower(), normalized)
    if not _LANGUAGE_CODE.fullmatch(normalized):
        raise ValueError("Language must be a valid BCP 47 language code.")
    parts = normalized.split("-")
    result = [parts[0].lower()]
    for part in parts[1:]:
        if len(part) == 2 and part.isalpha():
            result.append(part.upper())
        elif len(part) == 4 and part.isalpha():
            result.append(part.title())
        else:
            result.append(part)
    return "-".join(result)
