from sqlalchemy import text

from app.core.celery_app import celery_app
from app.core.database import session_scope


@celery_app.task(name="app.tasks.system.database_worker_health")
def database_worker_health() -> dict[str, str]:
    """Verify worker-to-PostgreSQL connectivity without simulating product work."""
    with session_scope() as session:
        session.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ok"}
