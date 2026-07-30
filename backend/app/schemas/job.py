from datetime import datetime

from app.models.job import GenerationJob, JobStatus, JobType
from app.schemas.common import StrictSchema


class GenerationJobResponse(StrictSchema):
    id: str
    project_id: str
    scene_id: str | None
    parent_job_id: str | None
    type: JobType
    status: JobStatus
    progress: int
    current_stage: str | None
    input_payload: dict[str, object]
    result_payload: dict[str, object] | None
    error_code: str | None
    error_message: str | None
    retry_count: int
    max_retries: int
    cancel_requested_at: datetime | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    updated_at: datetime


def job_to_response(job: GenerationJob) -> GenerationJobResponse:
    return GenerationJobResponse(
        id=job.id,
        project_id=job.project_id,
        scene_id=job.scene_id,
        parent_job_id=job.parent_job_id,
        type=job.type,
        status=job.status,
        progress=job.progress,
        current_stage=job.current_stage,
        input_payload=job.input_payload,
        result_payload=job.result_payload,
        error_code=job.error_code,
        error_message=job.error_message,
        retry_count=job.retry_count,
        max_retries=job.max_retries,
        cancel_requested_at=job.cancel_requested_at,
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
        updated_at=job.updated_at,
    )
