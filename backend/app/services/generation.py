from app.core.config import AppConfig
from app.core.errors import ApiError
from app.core.readiness import require_b2, require_ffmpeg, require_openai
from app.models.job import GenerationJob, JobType
from app.models.project import Project, ProjectStatus, VideoMode
from app.models.render import Render, RenderStatus
from app.models.scene import SceneStatus
from app.repositories.interfaces import JobDispatcher
from app.repositories.sqlalchemy import (
    AssetRepository,
    JobRepository,
    ProjectRepository,
    RenderRepository,
)


class GenerationService:
    def __init__(
        self,
        *,
        projects: ProjectRepository,
        jobs: JobRepository,
        assets: AssetRepository,
        renders: RenderRepository,
        dispatcher: JobDispatcher,
        config: AppConfig,
    ) -> None:
        self.projects = projects
        self.jobs = jobs
        self.assets = assets
        self.renders = renders
        self.dispatcher = dispatcher
        self.config = config

    def queue_storyboard(
        self,
        project_id: str,
        *,
        additional_instruction: str | None,
    ) -> GenerationJob:
        require_openai(self.config)
        project = self._project(project_id)
        if project.mode is not VideoMode.HISTORICAL_DOCUMENTARY:
            raise ApiError(
                status_code=409,
                code="state_conflict",
                message="Storyboard generation only supports Historical Documentary.",
                details={"project_id": project_id},
            )
        job = self.jobs.create(
            project_id=project_id,
            job_type=JobType.STORYBOARD,
            current_stage="queued",
        )
        job.input_data = {"additional_instruction": additional_instruction}
        project.status = ProjectStatus.GENERATING
        project.generation_progress = 0
        self.jobs.commit()
        self.dispatcher.dispatch(job.type, job.id)
        return self.jobs.get(job.id) or job

    def queue_scene(
        self,
        scene_id: str,
        *,
        instruction: str | None,
        regeneration: bool,
    ) -> GenerationJob:
        require_openai(self.config)
        require_b2(self.config)
        scene = self.projects.get_scene(scene_id)
        if scene is None:
            raise ApiError(
                status_code=404,
                code="scene_not_found",
                message="Scene not found.",
                details={"scene_id": scene_id},
            )
        job_type = (
            JobType.SCENE_REGENERATION if regeneration else JobType.SCENE_GENERATION
        )
        job = self.jobs.create(
            project_id=scene.chapter.project_id,
            scene_id=scene.id,
            job_type=job_type,
            current_stage="queued",
        )
        job.input_data = {"additional_instruction": instruction}
        scene.status = SceneStatus.QUEUED
        self.jobs.commit()
        self.dispatcher.dispatch(job.type, job.id)
        return self.jobs.get(job.id) or job

    def queue_render(
        self,
        project_id: str,
        *,
        captions_enabled: bool,
        music_enabled: bool,
        resolution: str,
    ) -> GenerationJob:
        require_openai(self.config)
        require_b2(self.config)
        require_ffmpeg(self.config)
        self._project(project_id)
        active_assets = self.assets.active_scene_assets(project_id)
        if len(active_assets) != 4:
            raise ApiError(
                status_code=409,
                code="state_conflict",
                message=(
                    "All four scenes need active generated assets before rendering."
                ),
                details={"ready_assets": len(active_assets), "required_assets": 4},
            )
        render = Render(
            project_id=project_id,
            version=self.renders.next_version(project_id),
            status=RenderStatus.QUEUED,
            resolution=resolution,
            captions_burned=captions_enabled,
            music_included=music_enabled,
        )
        self.renders.add(render)
        job = self.jobs.create(
            project_id=project_id,
            job_type=JobType.FINAL_RENDER,
            current_stage="queued",
        )
        job.input_data = {"render_id": render.id}
        self.jobs.commit()
        self.dispatcher.dispatch(job.type, job.id)
        return self.jobs.get(job.id) or job

    def get_job(self, job_id: str) -> GenerationJob:
        job = self.jobs.get(job_id)
        if job is None:
            raise ApiError(
                status_code=404,
                code="job_not_found",
                message="Generation job not found.",
                details={"job_id": job_id},
            )
        return job

    def get_render(self, render_id: str) -> Render:
        render = self.renders.get(render_id)
        if render is None:
            raise ApiError(
                status_code=404,
                code="render_not_found",
                message="Render not found.",
                details={"render_id": render_id},
            )
        return render

    def _project(self, project_id: str) -> Project:
        project = self.projects.get(project_id)
        if project is None:
            raise ApiError(
                status_code=404,
                code="project_not_found",
                message="Project not found.",
                details={"project_id": project_id},
            )
        return project
