from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import RedirectResponse, StreamingResponse

from app.core.config import settings
from app.core.errors import ApiError
from app.core.ids import new_resource_id
from app.core.sse import decode_media_key, format_sse_event
from app.media import SceneMediaGenerator
from app.media.genblaze_scene import GenblazeSceneGenerator
from app.schemas.scene_run import SceneRunRequest

router = APIRouter(tags=["Scene media"])


def get_scene_media_generator() -> SceneMediaGenerator:
    return GenblazeSceneGenerator(settings)


SceneMediaGeneratorDependency = Annotated[
    SceneMediaGenerator, Depends(get_scene_media_generator)
]


@router.post(
    "/scene-runs/stream",
    response_class=StreamingResponse,
    summary="Generate and store media for one TaleMotion scene",
)
def stream_scene_run(
    request: SceneRunRequest,
    generator: SceneMediaGeneratorDependency,
) -> StreamingResponse:
    run_id = new_resource_id("run")

    def events():
        for event in generator.run(request, run_id):
            yield format_sse_event(event)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )


def _validate_talemotion_key(key: str) -> str:
    if (
        not key.startswith("talemotion/projects/")
        or "\\" in key
        or "//" in key
        or any(part in {"", ".", ".."} for part in key.split("/"))
    ):
        raise ApiError(
            status_code=404,
            code="media_not_found",
            message="Media preview not found.",
        )
    return key


@router.get(
    "/media/{encoded_key}/preview",
    response_class=RedirectResponse,
    summary="Redirect to a short-lived Backblaze B2 preview URL",
)
def preview_media(
    encoded_key: str,
    generator: SceneMediaGeneratorDependency,
) -> RedirectResponse:
    try:
        key = _validate_talemotion_key(decode_media_key(encoded_key))
    except ValueError as error:
        raise ApiError(
            status_code=404,
            code="media_not_found",
            message="Media preview not found.",
        ) from error
    try:
        signed_url = generator.presign_preview(key)
    except Exception as error:
        raise ApiError(
            status_code=502,
            code="storage_failed",
            message="The media preview is temporarily unavailable.",
        ) from error
    return RedirectResponse(signed_url, status_code=307)
