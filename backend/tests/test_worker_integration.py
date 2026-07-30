import os

import pytest

from app.tasks.system import database_worker_health


@pytest.mark.integration
@pytest.mark.skipif(
    os.getenv("RUN_CELERY_INTEGRATION") != "1",
    reason="requires a running Redis broker and Celery worker",
)
def test_celery_worker_can_query_postgresql() -> None:
    result = database_worker_health.delay().get(timeout=15)
    assert result == {"status": "ok", "database": "ok"}
