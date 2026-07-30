from celery import Celery
from kombu import Queue

from app.core.config import settings

celery_app = Celery(
    "talemotion",
    broker=settings.broker_url,
    backend=settings.result_backend,
    include=[
        "app.tasks.storyboard",
        "app.tasks.media",
        "app.tasks.rendering",
    ],
)
celery_app.conf.update(
    task_queues=(
        Queue("storyboard"),
        Queue("media"),
        Queue("rendering"),
    ),
    task_default_queue="media",
    task_track_started=True,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
)
