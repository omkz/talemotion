from sqlalchemy.orm import Session

from app.core.ids import utc_now
from app.integrations.genblaze import GenerationProvider
from app.models.chapter import Chapter
from app.models.job import JobStatus
from app.models.project import ProjectStatus
from app.models.scene import Scene, SceneStatus
from app.repositories.sqlalchemy import JobRepository, ProjectRepository


def run_storyboard_pipeline(
    session: Session,
    *,
    job_id: str,
    provider: GenerationProvider,
) -> None:
    jobs = JobRepository(session)
    projects = ProjectRepository(session)
    job = jobs.get(job_id)
    if job is None:
        raise ValueError(f"Unknown storyboard job {job_id}")
    project = projects.get(job.project_id)
    if project is None:
        raise ValueError(f"Unknown project {job.project_id}")

    job.status = JobStatus.RUNNING
    job.progress = 10
    job.current_stage = "generating_storyboard"
    job.started_at = utc_now()
    jobs.commit()
    try:
        instruction = job.input_data.get("additional_instruction")
        result = provider.generate_storyboard(
            topic=project.topic,
            additional_direction=project.additional_direction,
            source_notes=project.source_notes,
            duration_seconds=project.duration_seconds,
            additional_instruction=(
                instruction if isinstance(instruction, str) else None
            ),
        )
        job.progress = 75
        job.current_stage = "persisting_scenes"
        jobs.commit()

        chapter: Chapter = project.chapters[0]
        chapter.scenes.clear()
        for generated in result.scenes:
            chapter.scenes.append(
                Scene(
                    title=generated.title,
                    narration=generated.narration,
                    visual_prompt=generated.visual_prompt,
                    duration_seconds=generated.duration_seconds,
                    position=generated.position,
                    status=SceneStatus.DRAFT,
                    active_asset_version=0,
                )
            )
        project.status = ProjectStatus.STORYBOARD_READY
        project.generation_progress = 25
        project.updated_at = utc_now()
        job.status = JobStatus.COMPLETED
        job.progress = 100
        job.current_stage = "completed"
        job.completed_at = utc_now()
        jobs.commit()
    except Exception as error:
        session.rollback()
        failed_job = jobs.get(job_id)
        failed_project = projects.get(job.project_id)
        if failed_job is not None:
            failed_job.status = JobStatus.FAILED
            failed_job.current_stage = "failed"
            failed_job.error_code = "storyboard_generation_failed"
            failed_job.error_message = str(error)
            failed_job.completed_at = utc_now()
        if failed_project is not None:
            failed_project.status = ProjectStatus.FAILED
        jobs.commit()
        raise
