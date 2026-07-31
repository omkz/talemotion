from dataclasses import dataclass

from app.core.errors import ApiError
from app.core.ids import utc_now
from app.models.asset import AssetStatus, AssetType
from app.models.job import GenerationJob, JobStatus, JobType
from app.models.project import ProjectStatus
from app.models.render import Render, RenderStatus
from app.repositories.sqlalchemy import (
    JobRepository,
    ProjectRepository,
    RenderRepository,
)
from app.schemas.render import CreateRenderRequest
from app.services.idempotency import existing_idempotent_job


@dataclass(frozen=True, slots=True)
class QueuedRender:
    render: Render
    job: GenerationJob
    created: bool


class RenderService:
    def __init__(
        self,
        projects: ProjectRepository,
        jobs: JobRepository,
        renders: RenderRepository,
    ) -> None:
        self.projects = projects
        self.jobs = jobs
        self.renders = renders

    def queue(
        self,
        project_id: str,
        request: CreateRenderRequest,
        *,
        idempotency_key: str | None = None,
    ) -> QueuedRender:
        project = self.projects.get_for_update(project_id)
        if project is None:
            raise ApiError(
                status_code=404,
                code="project_not_found",
                message="Project not found.",
                details={"project_id": project_id},
            )
        scenes = [
            scene
            for chapter in project.chapters
            for scene in chapter.scenes
        ]
        missing = []
        for scene in scenes:
            active_asset = next(
                (
                    asset
                    for asset in scene.assets
                    if asset.id == scene.active_asset_id
                    and asset.type in {AssetType.IMAGE, AssetType.VIDEO}
                    and asset.status is AssetStatus.AVAILABLE
                    and asset.storage_object_key
                ),
                None,
            )
            if active_asset is None:
                missing.append(scene.id)
        if not scenes or missing:
            raise ApiError(
                status_code=409,
                code="state_conflict",
                message="Every scene needs an available active image or video.",
                details={"project_id": project_id, "scene_ids": missing},
            )

        narration_enabled = (
            project.narration_enabled
            if request.narration_enabled is None
            else request.narration_enabled
        )
        captions_enabled = (
            project.captions_enabled
            if request.captions_enabled is None
            else request.captions_enabled
        )
        music_enabled = (
            project.music_enabled
            if request.music_enabled is None
            else request.music_enabled
        )
        payload: dict[str, object] = {
            "narration_enabled": narration_enabled,
            "captions_enabled": captions_enabled,
            "music_enabled": music_enabled,
        }
        existing, scoped_key = existing_idempotent_job(
            self.jobs,
            operation=f"project:{project_id}:render",
            key=idempotency_key,
            project_id=project_id,
            scene_id=None,
            job_type=JobType.RENDER,
            input_payload=payload,
        )
        if existing is not None:
            render_id = existing.input_payload.get("render_id")
            render = (
                self.renders.get(render_id)
                if isinstance(render_id, str)
                else None
            )
            if render is None:
                raise ApiError(
                    status_code=409,
                    code="state_conflict",
                    message="The idempotent render record is unavailable.",
                    details={"job_id": existing.id},
                )
            return QueuedRender(render, existing, created=False)
        active = self.renders.active_for_project(project_id)
        if active is not None:
            raise ApiError(
                status_code=409,
                code="state_conflict",
                message="This project already has an active render.",
                details={"project_id": project_id, "render_id": active.id},
            )
        render = self.renders.create(
            project_id=project_id,
            version=self.renders.next_version(project_id),
            narration_enabled=narration_enabled,
            captions_enabled=captions_enabled,
            music_enabled=music_enabled,
        )
        job = self.jobs.create(
            project_id=project_id,
            job_type=JobType.RENDER,
            current_stage="queued",
            input_payload={"render_id": render.id, **payload},
            idempotency_key=scoped_key,
        )
        render.job_id = job.id
        project.status = ProjectStatus.RENDERING
        project.generation_progress = 0
        self.renders.commit()
        return QueuedRender(
            render=render,
            job=self.jobs.get(job.id) or job,
            created=True,
        )

    def get(self, render_id: str) -> Render:
        render = self.renders.get(render_id)
        if render is None:
            raise ApiError(
                status_code=404,
                code="render_not_found",
                message="Render not found.",
                details={"render_id": render_id},
            )
        return render

    def list_for_project(self, project_id: str) -> list[Render]:
        if self.projects.get(project_id) is None:
            raise ApiError(
                status_code=404,
                code="project_not_found",
                message="Project not found.",
                details={"project_id": project_id},
            )
        return self.renders.list_for_project(project_id)

    def previewable(self, render_id: str) -> Render:
        render = self.get(render_id)
        if (
            render.status is not RenderStatus.COMPLETED
            or render.asset is None
            or render.asset.status is not AssetStatus.AVAILABLE
            or render.asset.type is not AssetType.FINAL_VIDEO
            or not render.asset.storage_object_key
        ):
            raise ApiError(
                status_code=409,
                code="state_conflict",
                message="The final video is not available for preview.",
                details={"render_id": render_id},
            )
        return render

    def mark_dispatch_failed(self, job_id: str, render_id: str) -> None:
        job = self.jobs.get_for_update(job_id)
        render = self.renders.get(render_id, for_update=True)
        if job is not None:
            job.status = JobStatus.FAILED
            job.current_stage = "queue_unavailable"
            job.error_code = "dependency_unavailable"
            job.error_message = "The rendering worker queue is unavailable."
            job.completed_at = utc_now()
        if render is not None:
            render.status = RenderStatus.FAILED
            render.completed_at = utc_now()
            render.project.status = ProjectStatus.FAILED
        self.renders.commit()
