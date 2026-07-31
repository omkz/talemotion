import hashlib

from app.core.errors import ApiError
from app.models.job import GenerationJob, JobType
from app.repositories.sqlalchemy import JobRepository


def scoped_idempotency_key(operation: str, key: str | None) -> str | None:
    if key is None:
        return None
    value = key.strip()
    if not value or len(value) > 128:
        raise ApiError(
            status_code=400,
            code="invalid_request",
            message="Idempotency-Key must contain between 1 and 128 characters.",
            details={},
        )
    digest = hashlib.sha256(f"{operation}\0{value}".encode()).hexdigest()
    return f"idem_{digest}"


def existing_idempotent_job(
    repository: JobRepository,
    *,
    operation: str,
    key: str | None,
    project_id: str,
    job_type: JobType,
    scene_id: str | None,
    input_payload: dict[str, object],
) -> tuple[GenerationJob | None, str | None]:
    scoped = scoped_idempotency_key(operation, key)
    if scoped is None:
        return None, None
    repository.lock_idempotency_key(scoped)
    existing = repository.by_idempotency_key(scoped)
    if existing is None:
        return None, scoped
    if (
        existing.project_id != project_id
        or existing.scene_id != scene_id
        or existing.type is not job_type
        or any(
            existing.input_payload.get(name) != value
            for name, value in input_payload.items()
        )
    ):
        raise ApiError(
            status_code=409,
            code="idempotency_conflict",
            message="This Idempotency-Key was already used for another request.",
            details={"job_id": existing.id},
        )
    return existing, scoped
