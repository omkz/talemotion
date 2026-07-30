from pydantic import ValidationError

from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.database import session_scope
from app.core.ids import utc_now
from app.media import SceneMediaError, StoryboardGenerator
from app.media.genblaze_scene import GenblazeStoryboardGenerator
from app.models.chapter import ChapterStatus
from app.models.job import GenerationJob, JobStatus
from app.models.project import ProjectStatus
from app.models.scene import Scene, SceneStatus
from app.repositories.sqlalchemy import JobRepository, ProjectRepository
from app.schemas.storyboard import HistoricalStoryboardDraft


def _valid_duration(
    draft: HistoricalStoryboardDraft,
    target_seconds: int,
) -> bool:
    total = sum(scene.duration_seconds for scene in draft.scenes)
    return abs(total - target_seconds) <= 2


def execute_storyboard_job(
    job_id: str,
    *,
    generator: StoryboardGenerator | None = None,
) -> dict[str, object]:
    storyboard_generator = generator or GenblazeStoryboardGenerator(settings)
    with session_scope() as session:
        jobs = JobRepository(session)
        projects = ProjectRepository(session)
        job = jobs.get_for_update(job_id)
        if job is None:
            return {"job_id": job_id, "status": "not_found"}
        if job.status is not JobStatus.QUEUED:
            return {"job_id": job.id, "status": job.status.value}
        project = projects.get(job.project_id)
        if project is None:
            _fail(job, "project_not_found", "The project no longer exists.")
            session.commit()
            return {"job_id": job.id, "status": "failed"}

        job.status = JobStatus.RUNNING
        job.current_stage = "planning_historical_storyboard"
        job.progress = 10
        job.started_at = utc_now()
        project.status = ProjectStatus.STORYBOARD_GENERATING
        session.commit()

        draft: HistoricalStoryboardDraft | None = None
        last_error: Exception | None = None
        attempts = max(1, min(settings.talemotion_storyboard_max_attempts, 5))
        for attempt in range(attempts):
            try:
                candidate = storyboard_generator.generate(
                    topic=project.topic,
                    additional_direction=project.additional_direction,
                    historical_accuracy_note=project.historical_accuracy_note,
                    visual_style=project.visual_style,
                    duration_seconds=project.duration_seconds,
                )
                if not _valid_duration(candidate, project.duration_seconds):
                    raise ValueError(
                        "Storyboard durations do not match the project duration."
                    )
                draft = candidate
                break
            except (SceneMediaError, ValidationError, ValueError) as error:
                last_error = error
                job.retry_count = min(attempt, job.max_retries)
                job.current_stage = "validating_storyboard_structure"
                job.progress = 20 + round((attempt + 1) / attempts * 30)
                session.commit()
                if isinstance(error, SceneMediaError) and not error.retryable:
                    break

        if draft is None:
            code = (
                last_error.code
                if isinstance(last_error, SceneMediaError)
                else "invalid_storyboard_output"
            )
            message = (
                last_error.message
                if isinstance(last_error, SceneMediaError)
                else "The storyboard provider returned invalid structured output."
            )
            _fail(job, code, message)
            project.status = ProjectStatus.FAILED
            session.commit()
            return {"job_id": job.id, "status": "failed"}

        locked_project = projects.get_for_update(project.id)
        if locked_project is None:
            _fail(job, "project_not_found", "The project no longer exists.")
            session.commit()
            return {"job_id": job.id, "status": "failed"}
        chapter = locked_project.chapters[0]
        replace_existing = bool(job.input_payload.get("replace_existing"))
        if chapter.scenes and not replace_existing:
            _fail(
                job,
                "state_conflict",
                "Storyboard scenes were added while generation was running.",
            )
            session.commit()
            return {"job_id": job.id, "status": "failed"}
        if chapter.scenes:
            projects.delete_chapter_scenes(chapter)
        chapter.scenes.extend(
            Scene(
                title=scene.title,
                narration=scene.narration,
                visual_prompt=scene.visual_prompt,
                duration_seconds=scene.duration_seconds,
                position=scene.position,
                status=SceneStatus.READY,
            )
            for scene in draft.scenes
        )
        chapter.status = ChapterStatus.READY
        locked_project.status = ProjectStatus.STORYBOARD_READY
        locked_project.generation_progress = 0
        job.status = JobStatus.COMPLETED
        job.current_stage = "storyboard_ready"
        job.progress = 100
        job.completed_at = utc_now()
        session.flush()
        job.result_payload = {
            "scene_ids": [scene.id for scene in chapter.scenes],
            "scene_count": 4,
        }
        session.commit()
        return {
            "job_id": job.id,
            "status": "completed",
            "scene_ids": list(job.result_payload["scene_ids"]),
        }


def _fail(job: GenerationJob, code: str, message: str) -> None:
    job.status = JobStatus.FAILED
    job.current_stage = "failed"
    job.error_code = code
    job.error_message = message
    job.completed_at = utc_now()
    job.updated_at = utc_now()


@celery_app.task(name="app.tasks.storyboard.generate_project_storyboard")
def generate_project_storyboard(job_id: str) -> dict[str, object]:
    return execute_storyboard_job(job_id)
