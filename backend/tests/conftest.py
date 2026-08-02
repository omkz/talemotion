import os
from collections.abc import Iterator
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker


class TestEnvironment(BaseSettings):
    database_url: str
    test_database_url: str
    redis_url: str
    celery_broker_url: str

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


try:
    test_environment = TestEnvironment()
except ValidationError:
    test_environment = None
if test_environment is not None:
    if test_environment.test_database_url == test_environment.database_url:
        raise RuntimeError("TEST_DATABASE_URL must not match DATABASE_URL.")
    test_database_name = (
        make_url(test_environment.test_database_url).database or ""
    )
    if "test" not in test_database_name.lower():
        raise RuntimeError(
            "TEST_DATABASE_URL must visibly reference a test database."
        )

    os.environ["DATABASE_URL"] = test_environment.test_database_url
    os.environ["REDIS_URL"] = test_environment.redis_url
    os.environ["CELERY_BROKER_URL"] = test_environment.celery_broker_url
else:
    os.environ.setdefault(
        "DATABASE_URL",
        "postgresql+psycopg://test:test@localhost:5432/talemotion_test",
    )
    os.environ.setdefault("REDIS_URL", "redis://localhost:6379/15")
    os.environ.setdefault("CELERY_BROKER_URL", "redis://localhost:6379/15")

# Provider choices are deterministic in the default suite and never trigger a
# paid call. This also isolates tests from a developer's legacy local .env.
os.environ["TALEMOTION_STORYBOARD_PROVIDER"] = "alibaba"
os.environ["TALEMOTION_STORYBOARD_MODEL"] = "qwen-plus"
os.environ["TALEMOTION_IMAGE_PROVIDER"] = "gmicloud"
os.environ["TALEMOTION_VIDEO_PROVIDER"] = "gmicloud"
os.environ["TALEMOTION_IMAGE_MODEL"] = "seedream-5.0-lite"
os.environ["TALEMOTION_VIDEO_MODEL"] = "wan2.6-i2v"
os.environ["TALEMOTION_STORAGE_PROVIDER"] = "local"
os.environ["TALEMOTION_LOCAL_STORAGE_PATH"] = "/tmp/talemotion-test-media"
os.environ["TALEMOTION_LOCAL_STORAGE_BASE_URL"] = "http://testserver/media"

from app.core.database import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402


@pytest.fixture
def session_factory() -> Iterator[sessionmaker[Session]]:
    if test_environment is None:
        pytest.skip("PostgreSQL integration tests require TEST_DATABASE_URL.")
    database_url = test_environment.test_database_url
    admin_engine = create_engine(database_url)
    schema = f"test_{uuid4().hex}"
    try:
        with admin_engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    except SQLAlchemyError:
        admin_engine.dispose()
        pytest.skip("Configured PostgreSQL test database is unavailable.")
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
def anonymous_client(
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
def client(
    anonymous_client: TestClient,
) -> Iterator[TestClient]:
    response = anonymous_client.post(
        "/api/v1/auth/register",
        json={
            "email": f"owner-{uuid4().hex}@example.com",
            "password": "correct horse battery staple",
            "name": "Test Owner",
        },
    )
    assert response.status_code == 201
    csrf_token = anonymous_client.cookies.get("talemotion_csrf")
    assert csrf_token
    anonymous_client.headers["X-CSRF-Token"] = csrf_token
    yield anonymous_client


@pytest.fixture
def app_client() -> Iterator[TestClient]:
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
