from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repositories.memory import InMemoryProjectRepository


@pytest.fixture
def client() -> Iterator[TestClient]:
    app.state.project_repository = InMemoryProjectRepository()
    with TestClient(app) as test_client:
        yield test_client
