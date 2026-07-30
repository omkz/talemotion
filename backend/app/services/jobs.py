from app.core.errors import ApiError
from app.core.ids import utc_now
from app.models.job import GenerationJob, JobStatus
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
        raise ApiError(
            status_code=501,
            code="not_implemented",
            message="Retry dispatch is unavailable until generation tasks exist.",
            details={"job_id": job_id, "job_type": job.type.value},
        )
