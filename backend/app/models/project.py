from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.chapter import Chapter


class VideoMode(StrEnum):
    HISTORICAL_DOCUMENTARY = "historical_documentary"
    MICRODRAMA = "microdrama"
    PRODUCT_ADVERTISEMENT = "product_advertisement"


class ProjectStatus(StrEnum):
    DRAFT = "draft"
    STORYBOARD_READY = "storyboard_ready"
    GENERATING = "generating"
    READY = "ready"
    FAILED = "failed"
    DELETED = "deleted"


class AspectRatio(StrEnum):
    VERTICAL = "9:16"
    LANDSCAPE = "16:9"


class HistoricalDocumentaryBrief(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal[VideoMode.HISTORICAL_DOCUMENTARY]
    topic: str
    additional_direction: str
    source_notes: str


class MicrodramaBrief(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal[VideoMode.MICRODRAMA]
    premise: str
    main_character: str
    genre: str
    desired_ending: str


class ProductAdvertisementBrief(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal[VideoMode.PRODUCT_ADVERTISEMENT]
    product_name: str
    product_description: str
    main_benefit: str
    target_audience: str
    call_to_action: str


ProjectBrief = Annotated[
    HistoricalDocumentaryBrief | MicrodramaBrief | ProductAdvertisementBrief,
    Field(discriminator="mode"),
]

SceneCount = Literal["auto", 4, 5, 6]
ProjectDuration = Literal[30, 45, 60]


class OutputConfiguration(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    language: str
    duration: ProjectDuration
    aspect_ratio: AspectRatio
    visual_style: str
    narration_style: str
    scene_count: SceneCount
    captions_enabled: bool
    music_enabled: bool


class Project(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    mode: VideoMode
    status: ProjectStatus
    brief: ProjectBrief
    output: OutputConfiguration
    chapters: list[Chapter]
    template_id: str | None
    thumbnail_url: str | None
    historical_accuracy_note: str | None
    generation_progress: int
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
