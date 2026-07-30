from fastapi import APIRouter

from app.api.dependencies import DatabaseSession, StorageDependency
from app.core.errors import ApiError
from app.repositories.sqlalchemy import RenderRepository
from app.schemas.common import ErrorResponse
from app.schemas.render import RenderResponse, render_to_response

router = APIRouter(prefix="/renders", tags=["Renders"])


@router.get(
    "/{render_id}",
    response_model=RenderResponse,
    summary="Get final render metadata",
    responses={404: {"model": ErrorResponse, "description": "Render not found"}},
)
def get_render(
    render_id: str,
    session: DatabaseSession,
    storage: StorageDependency,
) -> RenderResponse:
    render = RenderRepository(session).get(render_id)
    if render is None:
        raise ApiError(
            status_code=404,
            code="render_not_found",
            message="Render not found.",
            details={"render_id": render_id},
        )
    preview_url = None
    if render.b2_object_key:
        preview_url, _expires_at = storage.signed_url(render.b2_object_key)
    return render_to_response(render, preview_url=preview_url)
