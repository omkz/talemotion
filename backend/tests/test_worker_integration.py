from app.core.celery_app import celery_app


def test_celery_uses_redis_only_as_a_broker() -> None:
    assert celery_app.conf.task_ignore_result is True
    assert celery_app.backend.__class__.__name__ == "DisabledBackend"
