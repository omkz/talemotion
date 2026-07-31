from dataclasses import dataclass

from app.billing.pricing import pricing
from app.core.errors import ApiError
from app.core.ids import utc_now
from app.models.job import GenerationJob, JobStatus, JobType
from app.models.project import VideoMode
from app.models.scene import SceneStatus
from app.repositories.billing import BillingRepository
from app.repositories.sqlalchemy import JobRepository, ProjectRepository
from app.schemas.scene_generation import CreateSceneGenerationRequest
from app.services.credits import CreditService
from app.services.idempotency import existing_idempotent_job


@dataclass(frozen=True, slots=True)
class QueuedSceneGeneration:
    job: GenerationJob
    created: bool


class SceneGenerationService:
    def __init__(
        self,
        projects: ProjectRepository,
        jobs: JobRepository,
    ) -> None:
        self.projects = projects
        self.jobs = jobs

    def queue(
        self,
        scene_id: str,
        request: CreateSceneGenerationRequest,
        *,
        idempotency_key: str | None = None,
        additional_instruction: str | None = None,
    ) -> QueuedSceneGeneration:
        scene = self.projects.get_scene(scene_id)
        if scene is None:
            raise ApiError(
                status_code=404,
                code="scene_not_found",
                message="Scene not found.",
                details={"scene_id": scene_id},
            )
        project = scene.chapter.project
        if project.mode is not VideoMode.HISTORICAL_DOCUMENTARY:
            raise ApiError(
                status_code=409,
                code="state_conflict",
                message=(
                    "Real scene generation currently supports historical "
                    "documentary projects only."
                ),
                details={"scene_id": scene_id, "mode": project.mode.value},
            )
        locked_project = self.projects.get_for_update(project.id)
        if locked_project is None:
            raise ApiError(
                status_code=404,
                code="project_not_found",
                message="Project not found.",
                details={"project_id": project.id},
            )
        job_type = (
            JobType.SCENE_REGENERATION
            if additional_instruction is not None
            else JobType.SCENE_GENERATION
        )
        payload: dict[str, object] = {
            "duration_seconds": request.duration_seconds,
            "generate_video": request.generate_video,
        }
        if additional_instruction is not None:
            payload["additional_instruction"] = additional_instruction
            payload["parent_asset_id"] = scene.active_asset_id or ""
        existing, scoped_key = existing_idempotent_job(
            self.jobs,
            operation=f"scene:{scene_id}:{job_type.value}",
            key=idempotency_key,
            project_id=project.id,
            scene_id=scene.id,
            job_type=job_type,
            input_payload=payload,
        )
        if existing is not None:
            return QueuedSceneGeneration(existing, created=False)
        active = self.jobs.active_for_scene(scene_id)
        if active is not None:
            raise ApiError(
                status_code=409,
                code="state_conflict",
                message="This scene already has an active generation job.",
                details={"scene_id": scene_id, "job_id": active.id},
            )
        job = self.jobs.create(
            project_id=project.id,
            scene_id=scene.id,
            job_type=job_type,
            current_stage="queued",
            input_payload=payload,
            idempotency_key=scoped_key,
        )
        CreditService(
            BillingRepository(self.jobs.session, job.user_id)
        ).reserve(
            job=job,
            amount=pricing.scene_generation(
                generate_video=request.generate_video
            ),
            description="Scene media generation reservation",
        )
        scene.status = SceneStatus.QUEUED
        self.jobs.commit()
        return QueuedSceneGeneration(
            self.jobs.get(job.id) or job,
            created=True,
        )

    def mark_dispatch_failed(self, job_id: str) -> None:
        job = self.jobs.get_for_update(job_id)
        if job is None:
            return
        job.status = JobStatus.FAILED
        job.current_stage = "queue_dispatch_failed"
        job.error_code = "queue_unavailable"
        job.error_message = "The media worker queue is unavailable."
        job.completed_at = utc_now()
        job.updated_at = utc_now()
        if job.scene is not None:
            job.scene.status = SceneStatus.FAILED
        CreditService(BillingRepository(self.jobs.session)).settle(job.id)
        self.jobs.commit()
