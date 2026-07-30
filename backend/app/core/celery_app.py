from celery import Celery
from kombu import Queue

from app.core.config import settings

celery_app = Celery(
    "talemotion",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.tasks.system"],
)
celery_app.conf.update(
    task_queues=(
        Queue("storyboard"),
        Queue("media"),
        Queue("rendering"),
        Queue("system"),
    ),
    task_default_queue="system",
    task_routes={
        "app.tasks.system.database_worker_health": {"queue": "system"},
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
