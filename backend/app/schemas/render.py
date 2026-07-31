from datetime import datetime

from pydantic import Field

from app.models.render import Render, RenderStatus
from app.schemas.common import StrictSchema


class CreateRenderRequest(StrictSchema):
    narration_enabled: bool | None = None
    captions_enabled: bool | None = None
    music_enabled: bool | None = None


class RenderResponse(StrictSchema):
    id: str
    project_id: str
    job_id: str | None
    version: int
    status: RenderStatus
    asset_id: str | None
    duration_seconds: int | None
    file_size_bytes: int | None
    narration_enabled: bool
    captions_enabled: bool
    music_enabled: bool
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    updated_at: datetime


def render_to_response(render: Render) -> RenderResponse:
    return RenderResponse.model_validate(render, from_attributes=True)


class RenderListResponse(StrictSchema):
    items: list[RenderResponse] = Field(default_factory=list)
