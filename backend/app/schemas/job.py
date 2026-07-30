from datetime import datetime

from app.models.job import GenerationJob, JobStatus, JobType
from app.schemas.common import StrictSchema


class GenerationJobError(StrictSchema):
    code: str
    message: str
    details: dict[str, str | int | bool | None]


class GenerationJobResponse(StrictSchema):
    id: str
    type: JobType
    status: JobStatus
    progress: int
    current_stage: str | None
    project_id: str | None
    chapter_id: str | None
    scene_id: str | None
    parent_job_id: str | None
    child_job_ids: list[str]
    error: GenerationJobError | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None


def job_to_response(job: GenerationJob) -> GenerationJobResponse:
    chapter_id = job.scene.chapter_id if job.scene is not None else None
    error = None
    if job.error_code or job.error_message:
        error = GenerationJobError(
            code=job.error_code or "generation_failed",
            message=job.error_message or "Generation failed.",
            details={},
        )
    return GenerationJobResponse(
        id=job.id,
        type=job.type,
        status=job.status,
        progress=job.progress,
        current_stage=job.current_stage,
        project_id=job.project_id,
        chapter_id=chapter_id,
        scene_id=job.scene_id,
        parent_job_id=job.parent_job_id,
        child_job_ids=[child.id for child in job.children],
        error=error,
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
    )
