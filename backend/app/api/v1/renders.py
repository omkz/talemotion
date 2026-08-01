from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Header, status

from app.api.dependencies import CurrentAuth, DatabaseSession, MutationAuth
from app.core.config import settings
from app.core.errors import ApiError
from app.providers.factory import create_provider_factory
from app.repositories.sqlalchemy import (
    JobRepository,
    ProjectRepository,
    RenderRepository,
)
from app.schemas.common import ErrorResponse
from app.schemas.job import GenerationJobResponse, job_to_response
from app.schemas.render import (
    CreateRenderRequest,
    RenderListResponse,
    RenderResponse,
    render_to_response,
)
from app.schemas.scene_generation import SignedPreviewUrlResponse
from app.services.renders import RenderService
from app.tasks.rendering import render_project_video

router = APIRouter(tags=["Renders"])
ERROR_RESPONSES = {
    400: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    409: {"model": ErrorResponse},
    402: {"model": ErrorResponse},
    502: {"model": ErrorResponse},
    503: {"model": ErrorResponse},
}


def _renders(session: DatabaseSession, user_id: str) -> RenderService:
    return RenderService(
        ProjectRepository(session, user_id),
        JobRepository(session, user_id),
        RenderRepository(session, user_id),
    )


def enqueue_render(job_id: str) -> None:
    render_project_video.apply_async(
        args=[job_id],
        queue="rendering",
        task_id=job_id,
    )


@router.post(
    "/projects/{project_id}/renders",
    response_model=GenerationJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    responses=ERROR_RESPONSES,
    summary="Queue final video rendering",
)
def create_render(
    project_id: str,
    session: DatabaseSession,
    auth: MutationAuth,
    request: CreateRenderRequest | None = None,
    idempotency_key: Annotated[str | None, Header()] = None,
) -> GenerationJobResponse:
    service = _renders(session, auth.user.id)
    queued = service.queue(
        project_id,
        request or CreateRenderRequest(),
        idempotency_key=idempotency_key,
    )
    try:
        if queued.created:
            enqueue_render(queued.job.id)
    except Exception as error:
        service.mark_dispatch_failed(queued.job.id, queued.render.id)
        raise ApiError(
            status_code=503,
            code="dependency_unavailable",
            message="The rendering worker queue is unavailable.",
            details={"job_id": queued.job.id, "render_id": queued.render.id},
        ) from error
    return job_to_response(queued.job)


@router.get(
    "/projects/{project_id}/renders",
    response_model=RenderListResponse,
    responses=ERROR_RESPONSES,
)
def list_renders(
    project_id: str,
    session: DatabaseSession,
    auth: CurrentAuth,
) -> RenderListResponse:
    return RenderListResponse(
        items=[
            render_to_response(render)
            for render in _renders(session, auth.user.id).list_for_project(
                project_id
            )
        ]
    )


@router.get(
    "/renders/{render_id}",
    response_model=RenderResponse,
    responses=ERROR_RESPONSES,
)
def get_render(
    render_id: str,
    session: DatabaseSession,
    auth: CurrentAuth,
) -> RenderResponse:
    return render_to_response(
        _renders(session, auth.user.id).get(render_id)
    )


@router.post(
    "/renders/{render_id}/preview-url",
    response_model=SignedPreviewUrlResponse,
    responses=ERROR_RESPONSES,
)
def create_render_preview(
    render_id: str,
    session: DatabaseSession,
    auth: MutationAuth,
) -> SignedPreviewUrlResponse:
    render = _renders(session, auth.user.id).previewable(render_id)
    try:
        url = create_provider_factory(settings).render_media({}).presign_preview(
            render.asset.storage_object_key if render.asset else ""
        )
    except Exception as error:
        raise ApiError(
            status_code=502,
            code="storage_failed",
            message="The final-video preview is temporarily unavailable.",
            details={"render_id": render_id},
        ) from error
    return SignedPreviewUrlResponse(
        url=url,
        expires_at=(
            datetime.now(UTC)
            + timedelta(seconds=settings.media_preview_ttl_seconds)
        ).isoformat(),
    )
