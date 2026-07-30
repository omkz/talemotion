from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.database import SessionLocal
from app.integrations.ffmpeg import FFmpegRenderer
from app.integrations.genblaze import GenblazeOpenAIProvider
from app.integrations.storage import B2Storage
from app.pipelines.rendering import run_render_pipeline


@celery_app.task(name="app.tasks.rendering.render_project")
def render_project(job_id: str) -> None:
    with SessionLocal() as session:
        run_render_pipeline(
            session,
            job_id=job_id,
            provider=GenblazeOpenAIProvider(settings),
            storage=B2Storage(settings),
            renderer=FFmpegRenderer(settings),
            config=settings,
        )
