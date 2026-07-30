from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.database import SessionLocal
from app.integrations.genblaze import GenblazeOpenAIProvider
from app.pipelines.storyboard import run_storyboard_pipeline


@celery_app.task(name="app.tasks.storyboard.generate_storyboard")
def generate_storyboard(job_id: str) -> None:
    with SessionLocal() as session:
        run_storyboard_pipeline(
            session,
            job_id=job_id,
            provider=GenblazeOpenAIProvider(settings),
        )
