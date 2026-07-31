from dataclasses import dataclass

from app.billing.pricing import pricing
from app.core.errors import ApiError
from app.core.ids import utc_now
from app.models.credits import UsageOperation
from app.models.job import GenerationJob, JobStatus, JobType
from app.models.project import Project, ProjectStatus, VideoMode
from app.models.scene import SceneStatus
from app.repositories.billing import BillingRepository
from app.repositories.sqlalchemy import JobRepository, ProjectRepository
from app.schemas.storyboard import (
    CreateProjectGenerationRequest,
    CreateStoryboardRequest,
)
from app.services.credits import CreditService
from app.services.idempotency import existing_idempotent_job


@dataclass(frozen=True, slots=True)
class QueuedStoryboard:
    job: GenerationJob
    created: bool


@dataclass(slots=True)
class ProjectGenerationJobs:
    parent: GenerationJob
    children: list[GenerationJob]
    created: bool


class ProjectGenerationService:
    def __init__(
        self,
        projects: ProjectRepository,
        jobs: JobRepository,
    ) -> None:
        self.projects = projects
        self.jobs = jobs

    def queue_storyboard(
        self,
        project_id: str,
        request: CreateStoryboardRequest,
        *,
        idempotency_key: str | None = None,
    ) -> QueuedStoryboard:
        project = self._historical_project(project_id)
        payload: dict[str, object] = {
            "replace_existing": request.replace_existing
        }
        existing, scoped_key = existing_idempotent_job(
            self.jobs,
            operation=f"project:{project.id}:storyboard",
            key=idempotency_key,
            project_id=project.id,
            scene_id=None,
            job_type=JobType.STORYBOARD,
            input_payload=payload,
        )
        if existing is not None:
            return QueuedStoryboard(existing, created=False)
        active = self.jobs.active_for_project(project.id, JobType.STORYBOARD)
        if active is not None:
            raise ApiError(
                status_code=409,
                code="state_conflict",
                message="This project already has an active storyboard job.",
                details={"project_id": project.id, "job_id": active.id},
            )
        chapter = project.chapters[0]
        if chapter.scenes and not request.replace_existing:
            raise ApiError(
                status_code=409,
                code="state_conflict",
                message="The project already has storyboard scenes.",
                details={"project_id": project.id, "scene_count": len(chapter.scenes)},
            )
        job = self.jobs.create(
            project_id=project.id,
            job_type=JobType.STORYBOARD,
            current_stage="queued",
            input_payload=payload,
            max_retries=2,
            idempotency_key=scoped_key,
        )
        CreditService(
            BillingRepository(self.jobs.session, job.user_id)
        ).reserve(
            job=job,
            amount=pricing.rate(UsageOperation.STORYBOARD_GENERATION),
            description="Storyboard generation reservation",
        )
        project.status = ProjectStatus.STORYBOARD_PENDING
        self.jobs.commit()
        return QueuedStoryboard(self.jobs.get(job.id) or job, created=True)

    def queue_all_scenes(
        self,
        project_id: str,
        request: CreateProjectGenerationRequest,
        *,
        idempotency_key: str | None = None,
    ) -> ProjectGenerationJobs:
        project = self._historical_project(project_id)
        scenes = project.chapters[0].scenes
        payload: dict[str, object] = {
            "generate_video": request.generate_video
        }
        existing, scoped_key = existing_idempotent_job(
            self.jobs,
            operation=f"project:{project.id}:generation",
            key=idempotency_key,
            project_id=project.id,
            scene_id=None,
            job_type=JobType.PROJECT_GENERATION,
            input_payload=payload,
        )
        if existing is not None:
            return ProjectGenerationJobs(
                parent=existing,
                children=self.jobs.children(existing.id),
                created=False,
            )
        if project.status is not ProjectStatus.STORYBOARD_READY:
            raise ApiError(
                status_code=409,
                code="state_conflict",
                message="A completed storyboard is required before generation.",
                details={"project_id": project.id, "status": project.status.value},
            )
        if len(scenes) != 4:
            raise ApiError(
                status_code=409,
                code="state_conflict",
                message="Generate All requires exactly four storyboard scenes.",
                details={"project_id": project.id, "scene_count": len(scenes)},
            )
        active = self.jobs.active_for_project(
            project.id, JobType.PROJECT_GENERATION
        )
        if active is not None:
            raise ApiError(
                status_code=409,
                code="state_conflict",
                message="This project already has an active generation job.",
                details={"project_id": project.id, "job_id": active.id},
            )
        parent = self.jobs.create(
            project_id=project.id,
            job_type=JobType.PROJECT_GENERATION,
            current_stage="queued",
            input_payload=payload,
            idempotency_key=scoped_key,
        )
        children = [
            self.jobs.create(
                project_id=project.id,
                scene_id=scene.id,
                parent_job_id=parent.id,
                job_type=JobType.SCENE_GENERATION,
                current_stage="queued",
                input_payload={
                    "duration_seconds": 5,
                    "generate_video": request.generate_video,
                },
            )
            for scene in scenes
        ]
        CreditService(
            BillingRepository(self.jobs.session, parent.user_id)
        ).reserve(
            job=parent,
            amount=pricing.project_generation(
                scene_count=len(scenes),
                generate_video=request.generate_video,
            ),
            description="Generate-all scene media reservation",
        )
        for scene in scenes:
            scene.status = SceneStatus.QUEUED
        project.status = ProjectStatus.MEDIA_GENERATING
        project.generation_progress = 0
        self.jobs.commit()
        persisted_parent = self.jobs.get(parent.id) or parent
        return ProjectGenerationJobs(
            parent=persisted_parent,
            children=children,
            created=True,
        )

    def mark_queue_failure(
        self,
        job_ids: list[str],
        *,
        project_id: str,
    ) -> None:
        for job_id in job_ids:
            job = self.jobs.get_for_update(job_id)
            if job is None or job.status is not JobStatus.QUEUED:
                continue
            job.status = JobStatus.FAILED
            job.current_stage = "queue_unavailable"
            job.error_code = "dependency_unavailable"
            job.error_message = "The worker queue is unavailable."
            job.completed_at = utc_now()
        project = self.projects.get_for_update(project_id)
        if project is not None:
            project.status = ProjectStatus.FAILED
        credits = CreditService(BillingRepository(self.jobs.session))
        for job_id in job_ids:
            credits.settle(job_id)
        self.jobs.commit()

    def _historical_project(self, project_id: str) -> Project:
        project = self.projects.get_for_update(project_id)
        if project is None:
            raise ApiError(
                status_code=404,
                code="project_not_found",
                message="Project not found.",
                details={"project_id": project_id},
            )
        if (
            project.mode is not VideoMode.HISTORICAL_DOCUMENTARY
            or project.aspect_ratio.value != "9:16"
            or project.duration_seconds not in (30, 45)
        ):
            raise ApiError(
                status_code=409,
                code="state_conflict",
                message="This workflow supports vertical historical projects only.",
                details={"project_id": project_id},
            )
        return project
