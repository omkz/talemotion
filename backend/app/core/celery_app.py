from celery import Celery
from kombu import Queue

from app.core.config import settings

celery_app = Celery(
    "talemotion",
    broker=settings.celery_broker_url,
    include=[
        "app.tasks.media",
        "app.tasks.rendering",
        "app.tasks.storyboard",
        "app.tasks.system",
    ],
)
celery_app.conf.update(
    task_ignore_result=True,
    task_queues=(
        Queue("storyboard"),
        Queue("media"),
        Queue("rendering"),
        Queue("system"),
    ),
    task_default_queue="system",
    task_routes={
        "app.tasks.system.database_worker_health": {"queue": "system"},
        "app.tasks.media.generate_scene_media": {"queue": "media"},
        "app.tasks.storyboard.generate_project_storyboard": {
            "queue": "storyboard"
        },
        "app.tasks.rendering.render_project_video": {"queue": "rendering"},
    },
    task_track_started=True,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_soft_time_limit=3300,
    task_time_limit=3600,
)
