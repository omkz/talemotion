from __future__ import annotations

from collections.abc import Iterator
from decimal import Decimal

from sqlalchemy.orm import Session

from app.billing.pricing import pricing
from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.database import session_scope
from app.core.ids import new_resource_id, utc_now
from app.media import SceneMediaError, SceneMediaGenerator
from app.models.asset import Asset, AssetType
from app.models.credits import CreditTransactionType, UsageOperation
from app.models.job import GenerationJob, JobStatus
from app.models.scene import Scene, SceneStatus
from app.providers import ProviderCapability
from app.providers.errors import ProviderError
from app.providers.factory import create_provider_factory
from app.providers.selection import payload_with_selections, selections_from_payload
from app.repositories.billing import BillingRepository
from app.repositories.sqlalchemy import (
    AssetRepository,
    JobRepository,
    ProjectRepository,
)
from app.schemas.scene_run import (
    SceneImageCompletedEvent,
    SceneImageProgressEvent,
    SceneRunCompletedEvent,
    SceneRunEvent,
    SceneRunFailedEvent,
    SceneRunRequest,
    SceneVideoCompletedEvent,
    SceneVideoProgressEvent,
)
from app.services.credits import CreditService
from app.services.jobs import aggregate_parent_job


def _set_job_state(
    job: GenerationJob,
    *,
    status: JobStatus | None = None,
    stage: str | None = None,
    progress: int | None = None,
) -> None:
    if status is not None:
        job.status = status
    if stage is not None:
        job.current_stage = stage
    if progress is not None:
        job.progress = max(0, min(100, progress))
    job.updated_at = utc_now()


def _create_asset(
    repository: AssetRepository,
    *,
    job: GenerationJob,
    scene: Scene,
    event: SceneImageCompletedEvent | SceneVideoCompletedEvent,
    prompt: str,
) -> Asset:
    asset_type = (
        AssetType.IMAGE
        if event.type == "scene_image.completed"
        else AssetType.VIDEO
    )
    version = repository.next_version(scene.id, asset_type)
    return repository.create(
        project_id=job.project_id,
        scene_id=scene.id,
        asset_type=asset_type,
        version=version,
        provider=event.asset.provider,
        model_name=event.asset.model,
        prompt=prompt,
        generation_parameters={
            "duration_seconds": job.input_payload.get("duration_seconds"),
            "generate_video": job.input_payload.get("generate_video"),
        },
        storage_bucket=settings.b2_bucket_name or "",
        storage_object_key=event.asset.storage_object_key,
        mime_type=event.asset.media_type,
        file_size_bytes=event.asset.file_size_bytes,
        sha256=event.asset.sha256,
        provenance_object_key=event.manifest_object_key,
        parent_asset_id=(
            str(job.input_payload["parent_asset_id"])
            if job.input_payload.get("parent_asset_id")
            else None
        ),
    )


def _events(
    generator: SceneMediaGenerator,
    request: SceneRunRequest,
    run_id: str,
) -> Iterator[SceneRunEvent]:
    yield from generator.run(request, run_id)


def _settle_terminal_job(
    session: Session,
    jobs: JobRepository,
    job: GenerationJob,
) -> None:
    billing = BillingRepository(session)
    credits = CreditService(billing)
    has_own_reservation = (
        billing.transaction(job.id, CreditTransactionType.RESERVATION)
        is not None
    )
    if has_own_reservation:
        credits.settle(job.id)
        session.commit()
    parent = aggregate_parent_job(jobs, job.parent_job_id)
    if parent is not None and parent.status in {
        JobStatus.COMPLETED,
        JobStatus.FAILED,
        JobStatus.CANCELLED,
    }:
        credits.settle(parent.id)
        session.commit()


def execute_scene_media_job(
    job_id: str,
    *,
    generator: SceneMediaGenerator | None = None,
) -> dict[str, object]:
    with session_scope() as session:
        jobs = JobRepository(session)
        projects = ProjectRepository(session)
        assets = AssetRepository(session)
        job = jobs.get_for_update(job_id)
        if job is None:
            return {"job_id": job_id, "status": "not_found"}
        if job.status is JobStatus.CANCEL_REQUESTED:
            _set_job_state(
                job,
                status=JobStatus.CANCELLED,
                stage="cancelled",
            )
            job.completed_at = utc_now()
            session.commit()
            _settle_terminal_job(session, jobs, job)
            return {"job_id": job_id, "status": "cancelled"}
        if job.status is not JobStatus.QUEUED or not job.scene_id:
            return {"job_id": job_id, "status": job.status.value}

        scene = projects.get_scene(job.scene_id)
        if scene is None:
            _fail_job(
                job,
                scene=None,
                code="scene_not_found",
                message="The scene no longer exists.",
            )
            session.commit()
            _settle_terminal_job(session, jobs, job)
            return {"job_id": job_id, "status": "failed"}
        try:
            selections, legacy = selections_from_payload(
                job.input_payload,
                (ProviderCapability.IMAGE, ProviderCapability.VIDEO),
                settings,
            )
        except ProviderError as error:
            _fail_job(
                job,
                scene=scene,
                code=error.code,
                message=error.message,
            )
            session.commit()
            _settle_terminal_job(session, jobs, job)
            return {"job_id": job_id, "status": "failed"}
        if legacy:
            job.input_payload = payload_with_selections(
                job.input_payload, selections
            )
            session.commit()
        media_generator = generator or create_provider_factory(
            settings
        ).scene_media(selections)
        image_selection = selections[ProviderCapability.IMAGE]
        video_selection = selections[ProviderCapability.VIDEO]

        _set_job_state(
            job,
            status=JobStatus.RUNNING,
            stage="preparing_scene_media",
            progress=1,
        )
        job.started_at = utc_now()
        scene.status = SceneStatus.GENERATING
        session.commit()
        aggregate_parent_job(jobs, job.parent_job_id)

        additional_instruction = job.input_payload.get("additional_instruction")
        effective_prompt = scene.visual_prompt
        if isinstance(additional_instruction, str) and additional_instruction:
            effective_prompt = (
                f"{scene.visual_prompt}\n\nRegeneration instruction: "
                f"{additional_instruction}"
            )
        request = SceneRunRequest(
            project_id=job.project_id,
            scene_id=scene.id,
            title=scene.title,
            visual_prompt=effective_prompt,
            aspect_ratio=scene.chapter.project.aspect_ratio.value,
            duration_seconds=int(job.input_payload.get("duration_seconds", 5)),
            generate_video=bool(job.input_payload.get("generate_video", True)),
        )
        result_payload: dict[str, object] = {}
        try:
            for event in _events(
                media_generator,
                request,
                new_resource_id("run"),
            ):
                session.refresh(job)
                if job.status is JobStatus.CANCEL_REQUESTED:
                    _set_job_state(
                        job,
                        status=JobStatus.CANCELLED,
                        stage="cancelled",
                    )
                    job.completed_at = utc_now()
                    scene.status = (
                        SceneStatus.COMPLETED
                        if scene.active_asset_id
                        else SceneStatus.READY
                    )
                    session.commit()
                    _settle_terminal_job(session, jobs, job)
                    return {"job_id": job_id, "status": "cancelled"}

                if event.type == "scene_image.started":
                    _set_job_state(
                        job, stage="creating_scene_keyframe", progress=5
                    )
                elif isinstance(event, SceneImageProgressEvent):
                    provider_progress = event.progress or 0
                    _set_job_state(
                        job,
                        stage="creating_scene_keyframe",
                        progress=5 + round(provider_progress * 0.4),
                    )
                elif isinstance(event, SceneImageCompletedEvent):
                    image = _create_asset(
                        assets,
                        job=job,
                        scene=scene,
                        event=event,
                        prompt=effective_prompt,
                    )
                    CreditService(BillingRepository(session)).record_usage(
                        job=job,
                        operation=UsageOperation.IMAGE_GENERATION,
                        provider=image_selection.provider,
                        model_name=image_selection.model,
                        credits=pricing.rate(UsageOperation.IMAGE_GENERATION),
                        idempotency_key=f"usage:{job.id}:image",
                        input_units=Decimal(len(effective_prompt)),
                        metadata={"asset_id": image.id},
                    )
                    scene.active_asset_id = image.id
                    scene.active_asset_version = image.version
                    result_payload["image_asset_id"] = image.id
                    result_payload["asset_id"] = image.id
                    job.result_payload = dict(result_payload)
                    _set_job_state(
                        job, stage="scene_keyframe_stored", progress=50
                    )
                elif event.type == "scene_video.started":
                    _set_job_state(
                        job, stage="animating_scene_keyframe", progress=52
                    )
                elif isinstance(event, SceneVideoProgressEvent):
                    provider_progress = event.progress or 0
                    _set_job_state(
                        job,
                        stage="animating_scene_keyframe",
                        progress=52 + round(provider_progress * 0.43),
                    )
                elif isinstance(event, SceneVideoCompletedEvent):
                    video = _create_asset(
                        assets,
                        job=job,
                        scene=scene,
                        event=event,
                        prompt=effective_prompt,
                    )
                    CreditService(BillingRepository(session)).record_usage(
                        job=job,
                        operation=UsageOperation.VIDEO_GENERATION,
                        provider=video_selection.provider,
                        model_name=video_selection.model,
                        credits=pricing.rate(UsageOperation.VIDEO_GENERATION),
                        idempotency_key=f"usage:{job.id}:video",
                        input_units=Decimal(request.duration_seconds),
                        metadata={"asset_id": video.id},
                    )
                    scene.active_asset_id = video.id
                    scene.active_asset_version = video.version
                    result_payload["video_asset_id"] = video.id
                    result_payload["asset_id"] = video.id
                    job.result_payload = dict(result_payload)
                    _set_job_state(job, stage="scene_video_stored", progress=97)
                elif isinstance(event, SceneRunFailedEvent):
                    _fail_job(
                        job,
                        scene=scene,
                        code=event.code,
                        message=event.message,
                    )
                    session.commit()
                    _settle_terminal_job(session, jobs, job)
                    return {
                        "job_id": job_id,
                        "status": "failed",
                        **result_payload,
                    }
                elif isinstance(event, SceneRunCompletedEvent):
                    _set_job_state(
                        job,
                        status=JobStatus.COMPLETED,
                        stage="completed",
                        progress=100,
                    )
                    job.completed_at = utc_now()
                    job.result_payload = dict(result_payload)
                    scene.status = SceneStatus.COMPLETED
                session.commit()
                if event.type == "scene_run.completed":
                    _settle_terminal_job(session, jobs, job)
            if job.status is JobStatus.RUNNING:
                _fail_job(
                    job,
                    scene=scene,
                    code="provider_generation_failed",
                    message="The media pipeline ended without a terminal result.",
                )
                session.commit()
                _settle_terminal_job(session, jobs, job)
        except SceneMediaError as error:
            _fail_job(
                job,
                scene=scene,
                code=error.code,
                message=error.message,
            )
            session.commit()
            _settle_terminal_job(session, jobs, job)
            return {"job_id": job_id, "status": "failed", **result_payload}
        except TimeoutError:
            _fail_job(
                job,
                scene=scene,
                code="provider_timeout",
                message="The media provider timed out.",
            )
            session.commit()
            _settle_terminal_job(session, jobs, job)
            return {"job_id": job_id, "status": "failed", **result_payload}
        except Exception:
            _fail_job(
                job,
                scene=scene,
                code="unknown_error",
                message="Scene generation failed unexpectedly.",
            )
            session.commit()
            _settle_terminal_job(session, jobs, job)
            return {"job_id": job_id, "status": "failed", **result_payload}
        return {"job_id": job_id, "status": job.status.value, **result_payload}


def _fail_job(
    job: GenerationJob,
    *,
    scene: Scene | None,
    code: str,
    message: str,
) -> None:
    _set_job_state(
        job,
        status=JobStatus.FAILED,
        stage="failed",
    )
    job.error_code = code
    job.error_message = message
    job.completed_at = utc_now()
    if scene is not None:
        scene.status = SceneStatus.FAILED


@celery_app.task(name="app.tasks.media.generate_scene_media")
def generate_scene_media(job_id: str) -> dict[str, object]:
    return execute_scene_media_job(job_id)
