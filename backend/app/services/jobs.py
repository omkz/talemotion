from decimal import Decimal

from app.billing.pricing import pricing
from app.core.errors import ApiError
from app.core.ids import utc_now
from app.models.credits import UsageOperation
from app.models.job import GenerationJob, JobStatus, JobType
from app.models.project import ProjectStatus
from app.models.render import RenderStatus
from app.models.scene import SceneStatus
from app.repositories.billing import BillingRepository
from app.repositories.sqlalchemy import (
    JobRepository,
    ProjectRepository,
    RenderRepository,
)
from app.services.credits import CreditService


class JobService:
    def __init__(
        self,
        repository: JobRepository,
        projects: ProjectRepository,
        renders: RenderRepository,
    ) -> None:
        self.repository = repository
        self.projects = projects
        self.renders = renders

    def get_job(self, job_id: str) -> GenerationJob:
        job = self.repository.get(job_id)
        if job is None:
            raise ApiError(
                status_code=404,
                code="job_not_found",
                message="Generation job not found.",
                details={"job_id": job_id},
            )
        return job

    def request_cancellation(self, job_id: str) -> GenerationJob:
        job = self.get_job(job_id)
        if job.status not in {JobStatus.QUEUED, JobStatus.RUNNING}:
            raise ApiError(
                status_code=409,
                code="state_conflict",
                message="This job can no longer be cancelled.",
                details={"job_id": job_id, "status": job.status.value},
            )
        job.status = JobStatus.CANCEL_REQUESTED
        job.cancel_requested_at = utc_now()
        job.updated_at = utc_now()
        for child in self.repository.latest_children(job.id):
            if child.status in {JobStatus.QUEUED, JobStatus.RUNNING}:
                child.status = JobStatus.CANCEL_REQUESTED
                child.cancel_requested_at = job.cancel_requested_at
                child.updated_at = job.updated_at
        self.repository.commit()
        return self.get_job(job_id)

    def list_project_jobs(
        self,
        project_id: str,
        *,
        active_only: bool,
    ) -> list[GenerationJob]:
        if self.projects.get(project_id) is None:
            raise ApiError(
                status_code=404,
                code="project_not_found",
                message="Project not found.",
                details={"project_id": project_id},
            )
        return self.repository.list_for_project(
            project_id,
            active_only=active_only,
        )

    def retry(self, job_id: str) -> GenerationJob:
        job = self.get_job(job_id)
        if job.status not in {JobStatus.FAILED, JobStatus.CANCELLED}:
            raise ApiError(
                status_code=409,
                code="state_conflict",
                message="Only failed or cancelled jobs are eligible for retry.",
                details={"job_id": job_id, "status": job.status.value},
            )
        if job.error_code in {
            "missing_configuration",
            "provider_authentication_failed",
            "invalid_request",
            "render_input_invalid",
        }:
            raise ApiError(
                status_code=409,
                code="state_conflict",
                message="This failure requires configuration or input changes.",
                details={"job_id": job.id, "error_code": job.error_code},
            )
        if job.retry_count >= job.max_retries:
            raise ApiError(
                status_code=409,
                code="state_conflict",
                message="The maximum retry count has been reached.",
                details={"job_id": job_id, "max_retries": job.max_retries},
            )
        active = (
            self.repository.active_for_scene(job.scene_id)
            if job.scene_id
            else self.repository.active_for_project(job.project_id, job.type)
        )
        if active is not None:
            raise ApiError(
                status_code=409,
                code="state_conflict",
                message="Another attempt for this work is already active.",
                details={"job_id": job.id, "active_job_id": active.id},
            )
        if job.type is JobType.PROJECT_GENERATION:
            return self._retry_project_generation(job)
        if job.type is JobType.STORYBOARD:
            retry = self._copy_job(job)
            self._reserve(
                retry,
                pricing.rate(UsageOperation.STORYBOARD_GENERATION),
                "Storyboard retry reservation",
            )
            retry.project.status = ProjectStatus.STORYBOARD_PENDING
            self.repository.commit()
            return self.get_job(retry.id)
        if job.type is JobType.RENDER:
            return self._retry_render(job)
        if job.type not in {
            JobType.SCENE_GENERATION,
            JobType.SCENE_REGENERATION,
        } or not job.scene_id:
            raise ApiError(
                status_code=409,
                code="state_conflict",
                message="This job type cannot be retried.",
                details={"job_id": job_id, "job_type": job.type.value},
            )
        retry = self.repository.create(
            project_id=job.project_id,
            scene_id=job.scene_id,
            parent_job_id=job.parent_job_id,
            job_type=job.type,
            current_stage="queued",
            input_payload=dict(job.input_payload),
            retry_count=job.retry_count + 1,
            max_retries=job.max_retries,
        )
        self._reserve(
            retry,
            pricing.scene_generation(
                generate_video=bool(job.input_payload.get("generate_video", True))
            ),
            "Scene generation retry reservation",
        )
        if retry.scene is not None:
            retry.scene.status = SceneStatus.QUEUED
        if retry.parent_job_id:
            parent = self.repository.get_for_update(retry.parent_job_id)
            if parent is not None:
                parent.status = JobStatus.RUNNING
                parent.current_stage = "retrying_failed_scene"
                parent.error_code = None
                parent.error_message = None
                parent.completed_at = None
                parent.project.status = ProjectStatus.MEDIA_GENERATING
        self.repository.commit()
        return self.get_job(retry.id)

    def _copy_job(self, job: GenerationJob) -> GenerationJob:
        payload = dict(job.input_payload)
        payload["retry_of_job_id"] = job.id
        return self.repository.create(
            project_id=job.project_id,
            scene_id=job.scene_id,
            job_type=job.type,
            current_stage="queued",
            input_payload=payload,
            retry_count=job.retry_count + 1,
            max_retries=job.max_retries,
        )

    def _retry_project_generation(
        self,
        job: GenerationJob,
    ) -> GenerationJob:
        failed = [
            child
            for child in self.repository.latest_children(job.id)
            if child.status in {JobStatus.FAILED, JobStatus.CANCELLED}
        ]
        if not failed:
            raise ApiError(
                status_code=409,
                code="state_conflict",
                message="This project job has no failed scenes to resume.",
                details={"job_id": job.id},
            )
        exhausted = [
            child.id
            for child in failed
            if child.retry_count >= child.max_retries
        ]
        if exhausted:
            raise ApiError(
                status_code=409,
                code="state_conflict",
                message="One or more failed scene jobs exhausted their retries.",
                details={"job_id": job.id, "child_job_ids": exhausted},
            )
        parent = self._copy_job(job)
        self._reserve(
            parent,
            sum(
                (
                    pricing.scene_generation(
                        generate_video=bool(
                            child.input_payload.get("generate_video", True)
                        )
                    )
                    for child in failed
                ),
                start=Decimal("0"),
            ),
            "Generate-all retry reservation",
        )
        for child in failed:
            retry = self.repository.create(
                project_id=job.project_id,
                scene_id=child.scene_id,
                parent_job_id=parent.id,
                job_type=child.type,
                current_stage="queued",
                input_payload={
                    **child.input_payload,
                    "retry_of_job_id": child.id,
                },
                retry_count=child.retry_count + 1,
                max_retries=child.max_retries,
            )
            if retry.scene is not None:
                retry.scene.status = SceneStatus.QUEUED
        parent.project.status = ProjectStatus.MEDIA_GENERATING
        parent.project.generation_progress = 0
        self.repository.commit()
        return self.get_job(parent.id)

    def _retry_render(self, job: GenerationJob) -> GenerationJob:
        render_id = job.input_payload.get("render_id")
        render = (
            self.renders.get(render_id, for_update=True)
            if isinstance(render_id, str)
            else None
        )
        if render is None:
            raise ApiError(
                status_code=409,
                code="state_conflict",
                message="The failed render record is unavailable.",
                details={"job_id": job.id},
            )
        retry = self._copy_job(job)
        self._reserve(
            retry,
            pricing.render(
                scene_count=sum(
                    len(chapter.scenes)
                    for chapter in retry.project.chapters
                ),
                narration_enabled=bool(
                    retry.input_payload.get("narration_enabled", True)
                ),
                music_enabled=bool(
                    retry.input_payload.get("music_enabled", True)
                ),
            ),
            "Final render retry reservation",
        )
        render.job_id = retry.id
        render.status = RenderStatus.QUEUED
        render.started_at = None
        render.completed_at = None
        retry.project.status = ProjectStatus.RENDERING
        self.repository.commit()
        return self.get_job(retry.id)

    def mark_queue_failure(self, job_id: str) -> None:
        job = self.repository.get_for_update(job_id)
        if job is None or job.status is not JobStatus.QUEUED:
            return
        job.status = JobStatus.FAILED
        job.current_stage = "queue_unavailable"
        job.error_code = "dependency_unavailable"
        job.error_message = "The worker queue is unavailable."
        job.completed_at = utc_now()
        if job.scene is not None:
            job.scene.status = SceneStatus.FAILED
        if job.type is JobType.RENDER:
            render_id = job.input_payload.get("render_id")
            render = (
                self.renders.get(render_id, for_update=True)
                if isinstance(render_id, str)
                else None
            )
            if render is not None:
                render.status = RenderStatus.FAILED
                render.completed_at = utc_now()
        CreditService(BillingRepository(self.repository.session)).settle(job.id)
        self.repository.commit()
        aggregate_parent_job(self.repository, job.parent_job_id)

    def _reserve(
        self,
        job: GenerationJob,
        amount: Decimal,
        description: str,
    ) -> None:
        CreditService(
            BillingRepository(self.repository.session, job.user_id)
        ).reserve(job=job, amount=amount, description=description)


def aggregate_parent_job(
    repository: JobRepository,
    parent_job_id: str | None,
) -> GenerationJob | None:
    if not parent_job_id:
        return None
    parent = repository.get_for_update(parent_job_id)
    if parent is None:
        return None
    children = repository.latest_children(parent_job_id)
    if not children:
        return parent
    completed = sum(child.status is JobStatus.COMPLETED for child in children)
    active = [
        child
        for child in children
        if child.status
        in {JobStatus.QUEUED, JobStatus.RUNNING, JobStatus.CANCEL_REQUESTED}
    ]
    failed = [child for child in children if child.status is JobStatus.FAILED]
    cancelled = [
        child for child in children if child.status is JobStatus.CANCELLED
    ]
    parent.progress = round(completed / len(children) * 100)
    parent.updated_at = utc_now()
    parent.project.generation_progress = parent.progress
    if completed == len(children):
        parent.status = JobStatus.COMPLETED
        parent.current_stage = "completed"
        parent.error_code = None
        parent.error_message = None
        parent.completed_at = utc_now()
        parent.project.status = ProjectStatus.READY
    elif active:
        parent.status = (
            JobStatus.QUEUED
            if all(child.status is JobStatus.QUEUED for child in children)
            else JobStatus.RUNNING
        )
        parent.current_stage = f"{completed}_of_{len(children)}_scenes_complete"
        parent.error_code = None
        parent.error_message = None
        parent.completed_at = None
        parent.project.status = ProjectStatus.MEDIA_GENERATING
    elif failed:
        parent.status = JobStatus.FAILED
        parent.current_stage = "scene_generation_failed"
        parent.error_code = "child_generation_failed"
        parent.error_message = f"{len(failed)} scene generation job(s) failed."
        parent.completed_at = utc_now()
        parent.project.status = ProjectStatus.FAILED
    elif cancelled:
        parent.status = JobStatus.CANCELLED
        parent.current_stage = "cancelled"
        parent.completed_at = utc_now()
        parent.project.status = ProjectStatus.STORYBOARD_READY
    repository.commit()
    return parent
