from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.database import get_db
from app.main import app
from app.models import Base
from app.models.job import JobType


class RecordingDispatcher:
    def __init__(self) -> None:
        self.calls: list[tuple[JobType, str]] = []

    def dispatch(self, job_type: JobType, job_id: str) -> None:
        self.calls.append((job_type, job_id))


@pytest.fixture
def session_factory() -> Iterator[sessionmaker[Session]]:
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    yield factory
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def dispatcher() -> RecordingDispatcher:
    return RecordingDispatcher()


@pytest.fixture
def client(
    session_factory: sessionmaker[Session],
    dispatcher: RecordingDispatcher,
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[TestClient]:
    def override_database() -> Iterator[Session]:
        with session_factory() as session:
            yield session

    monkeypatch.setattr(settings, "openai_api_key", SecretStr("test-openai-key"))
    monkeypatch.setattr(settings, "b2_endpoint", "https://s3.example.invalid")
    monkeypatch.setattr(settings, "b2_region", "us-west-004")
    monkeypatch.setattr(settings, "b2_bucket", "talemotion-test")
    monkeypatch.setattr(settings, "b2_key_id", SecretStr("test-key-id"))
    monkeypatch.setattr(
        settings,
        "b2_application_key",
        SecretStr("test-application-key"),
    )
    app.dependency_overrides[get_db] = override_database
    app.state.job_dispatcher = dispatcher
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
