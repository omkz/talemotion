from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict

from app.models.scene import Scene


class ChapterStatus(StrEnum):
    DRAFT = "draft"
    READY = "ready"
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"


class Chapter(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    project_id: str
    title: str
    summary: str | None
    position: int
    target_duration_seconds: int
    status: ChapterStatus
    scenes: list[Scene]
    created_at: datetime
    updated_at: datetime
