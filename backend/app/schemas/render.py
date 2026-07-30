from datetime import datetime
from typing import Literal

from pydantic import Field

from app.models.render import Render, RenderStatus
from app.schemas.common import StrictSchema


class CreateRenderRequest(StrictSchema):
    captions_enabled: Literal[True] = True
    background_music_enabled: Literal[False] = False
    resolution: str = Field(default="1080x1920", pattern=r"^\d+x\d+$")


class RenderResponse(StrictSchema):
    id: str
    project_id: str
    version: int
    status: RenderStatus
    resolution: str
    duration_seconds: int
    file_size_bytes: int
    captions_burned: bool
    music_included: bool
    thumbnail_url: str | None
    preview_url: str | None
    created_at: datetime
    updated_at: datetime


class RenderListResponse(StrictSchema):
    items: list[RenderResponse]


def render_to_response(
    render: Render,
    *,
    preview_url: str | None = None,
) -> RenderResponse:
    return RenderResponse(
        id=render.id,
        project_id=render.project_id,
        version=render.version,
        status=render.status,
        resolution=render.resolution,
        duration_seconds=render.duration_seconds or 0,
        file_size_bytes=render.file_size_bytes or 0,
        captions_burned=render.captions_burned,
        music_included=render.music_included,
        thumbnail_url=None,
        preview_url=preview_url,
        created_at=render.created_at,
        updated_at=render.completed_at or render.created_at,
    )
