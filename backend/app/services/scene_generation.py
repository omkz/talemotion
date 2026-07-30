from app.core.errors import ApiError
from app.core.ids import utc_now
from app.models.job import GenerationJob, JobStatus, JobType
from app.models.project import VideoMode
from app.models.scene import SceneStatus
from app.repositories.sqlalchemy import JobRepository, ProjectRepository
from app.schemas.scene_generation import CreateSceneGenerationRequest


class SceneGenerationService:
    def __init__(
        self,
        projects: ProjectRepository,
        jobs: JobRepository,
    ) -> None:
        self.projects = projects
        self.jobs = jobs

    def queue(
        self,
        scene_id: str,
        request: CreateSceneGenerationRequest,
    ) -> GenerationJob:
        scene = self.projects.get_scene(scene_id)
        if scene is None:
            raise ApiError(
                status_code=404,
                code="scene_not_found",
                message="Scene not found.",
                details={"scene_id": scene_id},
            )
        project = scene.chapter.project
        if project.mode is not VideoMode.HISTORICAL_DOCUMENTARY:
            raise ApiError(
                status_code=409,
                code="state_conflict",
                message=(
                    "Real scene generation currently supports historical "
                    "documentary projects only."
                ),
                details={"scene_id": scene_id, "mode": project.mode.value},
            )
        active = self.jobs.active_for_scene(scene_id)
        if active is not None:
            raise ApiError(
                status_code=409,
                code="state_conflict",
                message="This scene already has an active generation job.",
                details={"scene_id": scene_id, "job_id": active.id},
            )
        job = self.jobs.create(
            project_id=project.id,
            scene_id=scene.id,
            job_type=JobType.SCENE_GENERATION,
            current_stage="queued",
            input_payload={
                "duration_seconds": request.duration_seconds,
                "generate_video": request.generate_video,
            },
        )
        scene.status = SceneStatus.QUEUED
        self.jobs.commit()
        return self.jobs.get(job.id) or job

    def mark_dispatch_failed(self, job_id: str) -> None:
        job = self.jobs.get_for_update(job_id)
        if job is None:
            return
        job.status = JobStatus.FAILED
        job.current_stage = "queue_dispatch_failed"
        job.error_code = "queue_unavailable"
        job.error_message = "The media worker queue is unavailable."
        job.completed_at = utc_now()
        job.updated_at = utc_now()
        if job.scene is not None:
            job.scene.status = SceneStatus.FAILED
        self.jobs.commit()
