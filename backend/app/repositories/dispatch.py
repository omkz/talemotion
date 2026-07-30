from app.core.celery_app import celery_app
from app.models.job import JobType


class CeleryJobDispatcher:
    _TASKS = {
        JobType.STORYBOARD: ("app.tasks.storyboard.generate_storyboard", "storyboard"),
        JobType.SCENE_GENERATION: ("app.tasks.media.generate_scene_media", "media"),
        JobType.SCENE_REGENERATION: ("app.tasks.media.generate_scene_media", "media"),
        JobType.FINAL_RENDER: ("app.tasks.rendering.render_project", "rendering"),
    }

    def dispatch(self, job_type: JobType, job_id: str) -> None:
        task_name, queue = self._TASKS[job_type]
        celery_app.send_task(task_name, args=[job_id], queue=queue)
