from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict


class SceneStatus(StrEnum):
    DRAFT = "draft"
    READY = "ready"
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"


class Scene(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    chapter_id: str
    title: str
    narration: str
    visual_prompt: str
    duration_seconds: int
    position: int
    status: SceneStatus
    created_at: datetime
    updated_at: datetime
