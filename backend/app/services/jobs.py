from app.core.errors import ApiError
from app.core.ids import utc_now
from app.models.job import GenerationJob, JobStatus, JobType
from app.models.project import ProjectStatus
from app.models.scene import SceneStatus
from app.repositories.sqlalchemy import JobRepository


class JobService:
    def __init__(self, repository: JobRepository) -> None:
        self.repository = repository

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
        self.repository.commit()
        return self.get_job(job_id)

    def retry(self, job_id: str) -> GenerationJob:
        job = self.get_job(job_id)
        if job.status not in {JobStatus.FAILED, JobStatus.CANCELLED}:
            raise ApiError(
                status_code=409,
                code="state_conflict",
                message="Only failed or cancelled jobs are eligible for retry.",
                details={"job_id": job_id, "status": job.status.value},
            )
        if job.retry_count >= job.max_retries:
            raise ApiError(
                status_code=409,
                code="state_conflict",
                message="The maximum retry count has been reached.",
                details={"job_id": job_id, "max_retries": job.max_retries},
            )
        if job.type is not JobType.SCENE_GENERATION or not job.scene_id:
            raise ApiError(
                status_code=501,
                code="not_implemented",
                message="Retry is currently available only for scene generation.",
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

    def mark_queue_failure(self, job_id: str) -> None:
        job = self.repository.get_for_update(job_id)
        if job is None or job.status is not JobStatus.QUEUED:
            return
        job.status = JobStatus.FAILED
        job.current_stage = "queue_unavailable"
        job.error_code = "dependency_unavailable"
        job.error_message = "The worker queue is unavailable."
        job.completed_at = utc_now()
        self.repository.commit()
        aggregate_parent_job(self.repository, job.parent_job_id)


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
