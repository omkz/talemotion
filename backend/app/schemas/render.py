from datetime import datetime

from app.models.render import Render, RenderStatus
from app.schemas.common import StrictSchema


class RenderResponse(StrictSchema):
    id: str
    project_id: str
    job_id: str | None
    version: int
    status: RenderStatus
    asset_id: str | None
    duration_seconds: int | None
    file_size_bytes: int | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    updated_at: datetime


def render_to_response(render: Render) -> RenderResponse:
    return RenderResponse.model_validate(render, from_attributes=True)
