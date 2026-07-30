from typing import Protocol

from app.models.job import JobType


class JobDispatcher(Protocol):
    def dispatch(self, job_type: JobType, job_id: str) -> None: ...
