from datetime import timedelta

from sqlalchemy import text

from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.database import session_scope
from app.core.ids import utc_now
from app.models.credits import CreditTransactionType
from app.models.job import JobStatus, JobType
from app.models.project import ProjectStatus
from app.models.render import RenderStatus
from app.models.scene import SceneStatus
from app.repositories.billing import BillingRepository
from app.repositories.sqlalchemy import JobRepository, RenderRepository
from app.services.credits import CreditService
from app.services.jobs import aggregate_parent_job


@celery_app.task(name="app.tasks.system.database_worker_health")
def database_worker_health() -> dict[str, str]:
    """Verify worker-to-PostgreSQL connectivity without simulating product work."""
    with session_scope() as session:
        session.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ok"}


@celery_app.task(name="app.tasks.system.cleanup_abandoned_jobs")
def cleanup_abandoned_jobs() -> dict[str, int]:
    """Fail or cancel jobs whose workers stopped updating persisted state."""
    now = utc_now()
    parent_ids: set[str] = set()
    cleaned = 0
    with session_scope() as session:
        jobs = JobRepository(session)
        renders = RenderRepository(session)
        billing = BillingRepository(session)
        credits = CreditService(billing)
        stale = jobs.stale_jobs(
            queued_before=now
            - timedelta(seconds=settings.queued_job_timeout_seconds),
            running_before=now
            - timedelta(seconds=settings.running_job_timeout_seconds),
        )
        for job in stale:
            was_cancel_requested = job.status is JobStatus.CANCEL_REQUESTED
            job.status = (
                JobStatus.CANCELLED
                if was_cancel_requested
                else JobStatus.FAILED
            )
            job.current_stage = (
                "cancelled" if was_cancel_requested else "abandoned"
            )
            job.error_code = (
                None if was_cancel_requested else "job_heartbeat_timeout"
            )
            job.error_message = (
                None
                if was_cancel_requested
                else "The worker stopped updating this job."
            )
            job.completed_at = now
            job.updated_at = now
            if job.scene is not None:
                job.scene.status = (
                    SceneStatus.COMPLETED
                    if job.scene.active_asset_id
                    else (
                        SceneStatus.READY
                        if was_cancel_requested
                        else SceneStatus.FAILED
                    )
                )
            if job.type is JobType.RENDER:
                render_id = job.input_payload.get("render_id")
                render = (
                    renders.get(render_id, for_update=True)
                    if isinstance(render_id, str)
                    else None
                )
                if render is not None:
                    render.status = (
                        RenderStatus.CANCELLED
                        if was_cancel_requested
                        else RenderStatus.FAILED
                    )
                    render.completed_at = now
            if job.parent_job_id:
                parent_ids.add(job.parent_job_id)
            elif job.type is not JobType.PROJECT_GENERATION:
                job.project.status = (
                    ProjectStatus.READY
                    if was_cancel_requested
                    and job.type is JobType.RENDER
                    else ProjectStatus.FAILED
                )
            cleaned += 1
            if (
                billing.transaction(
                    job.id,
                    CreditTransactionType.RESERVATION,
                )
                is not None
            ):
                credits.settle(job.id)
        session.commit()
        for parent_id in parent_ids:
            parent = aggregate_parent_job(jobs, parent_id)
            if parent is not None and parent.status in {
                JobStatus.COMPLETED,
                JobStatus.FAILED,
                JobStatus.CANCELLED,
            }:
                credits.settle(parent.id)
                session.commit()
    return {"cleaned": cleaned}
