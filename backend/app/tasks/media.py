from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.database import SessionLocal
from app.integrations.genblaze import GenblazeOpenAIProvider
from app.integrations.storage import B2Storage
from app.pipelines.media import run_media_pipeline


@celery_app.task(name="app.tasks.media.generate_scene_media")
def generate_scene_media(job_id: str) -> None:
    with SessionLocal() as session:
        run_media_pipeline(
            session,
            job_id=job_id,
            provider=GenblazeOpenAIProvider(settings),
            storage=B2Storage(settings),
            work_dir=settings.media_work_dir / job_id,
        )
