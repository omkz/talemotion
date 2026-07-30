from typing import Annotated, cast

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.integrations.storage import B2Storage, ObjectStorage
from app.repositories.interfaces import JobDispatcher

DatabaseSession = Annotated[Session, Depends(get_db)]


def get_job_dispatcher(request: Request) -> JobDispatcher:
    return cast(JobDispatcher, request.app.state.job_dispatcher)


JobDispatcherDependency = Annotated[
    JobDispatcher,
    Depends(get_job_dispatcher),
]


def get_storage() -> ObjectStorage:
    return B2Storage(settings)


StorageDependency = Annotated[ObjectStorage, Depends(get_storage)]
