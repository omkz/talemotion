import os
from collections.abc import Iterator
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker


class TestEnvironment(BaseSettings):
    database_url: str
    test_database_url: str
    redis_url: str
    celery_broker_url: str
    celery_result_backend: str

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


try:
    test_environment = TestEnvironment()
except ValidationError as error:
    raise RuntimeError(
        "Database tests require DATABASE_URL, TEST_DATABASE_URL, REDIS_URL, "
        "CELERY_BROKER_URL, and CELERY_RESULT_BACKEND in backend/.env or "
        "the process environment."
    ) from error
if test_environment.test_database_url == test_environment.database_url:
    raise RuntimeError("TEST_DATABASE_URL must not match DATABASE_URL.")
test_database_name = make_url(test_environment.test_database_url).database or ""
if "test" not in test_database_name.lower():
    raise RuntimeError(
        "TEST_DATABASE_URL must visibly reference a test database."
    )

os.environ["DATABASE_URL"] = test_environment.test_database_url
os.environ["REDIS_URL"] = test_environment.redis_url
os.environ["CELERY_BROKER_URL"] = test_environment.celery_broker_url
os.environ["CELERY_RESULT_BACKEND"] = test_environment.celery_result_backend

from app.core.database import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402


@pytest.fixture
def session_factory() -> Iterator[sessionmaker[Session]]:
    database_url = os.environ["DATABASE_URL"]
    admin_engine = create_engine(database_url)
    schema = f"test_{uuid4().hex}"
    with admin_engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(
        database_url,
        connect_args={"options": f"-csearch_path={schema}"},
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    try:
        yield factory
    finally:
        engine.dispose()
        with admin_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin_engine.dispose()


@pytest.fixture
def client(
    session_factory: sessionmaker[Session],
) -> Iterator[TestClient]:
    def override_database() -> Iterator[Session]:
        with session_factory() as session:
            try:
                yield session
            except Exception:
                session.rollback()
                raise

    app.dependency_overrides[get_db] = override_database
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def project_payload() -> dict[str, object]:
    return {
        "mode": "historical_documentary",
        "title": "The Rise of Majapahit",
        "topic": "The rise of the Majapahit Empire",
        "additional_direction": "Focus on maritime power.",
        "language": "en",
        "duration_seconds": 45,
        "aspect_ratio": "9:16",
        "visual_style": "cinematic historical realism",
        "narration_style": "dramatic documentary",
        "captions_enabled": True,
        "music_enabled": True,
        "historical_accuracy_note": "Use plausible regional material culture.",
    }
