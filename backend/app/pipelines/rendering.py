import hashlib
from pathlib import Path
from tempfile import TemporaryDirectory

from sqlalchemy.orm import Session

from app.core.config import AppConfig
from app.core.ids import utc_now
from app.integrations.ffmpeg import RenderSceneInput, VideoRenderer
from app.integrations.genblaze import GenerationProvider
from app.integrations.storage import ObjectStorage
from app.models.asset import Asset, AssetStatus, AssetType
from app.models.job import JobStatus
from app.models.project import ProjectStatus
from app.models.render import RenderStatus
from app.repositories.sqlalchemy import (
    AssetRepository,
    JobRepository,
    ProjectRepository,
    RenderRepository,
)


def run_render_pipeline(
    session: Session,
    *,
    job_id: str,
    provider: GenerationProvider,
    storage: ObjectStorage,
    renderer: VideoRenderer,
    config: AppConfig,
) -> None:
    jobs = JobRepository(session)
    projects = ProjectRepository(session)
    assets = AssetRepository(session)
    renders = RenderRepository(session)
    job = jobs.get(job_id)
    if job is None:
        raise ValueError(f"Unknown render job {job_id}")
    render_id = job.input_data.get("render_id")
    if not isinstance(render_id, str):
        raise ValueError("Render job is missing render_id")
    render = renders.get(render_id)
    project = projects.get(job.project_id)
    if render is None or project is None:
        raise ValueError("Render or project no longer exists")

    job.status = JobStatus.RUNNING
    job.started_at = utc_now()
    job.progress = 5
    job.current_stage = "preparing_render"
    render.status = RenderStatus.RENDERING
    jobs.commit()

    try:
        active_assets = assets.active_scene_assets(project.id)
        if len(active_assets) != 4:
            raise ValueError("Rendering requires four active scene assets")
        config.media_work_dir.mkdir(parents=True, exist_ok=True)
        with TemporaryDirectory(
            prefix=f"render-{render.id}-",
            dir=config.media_work_dir,
        ) as temporary:
            temporary_path = Path(temporary)
            render_inputs: list[RenderSceneInput] = []
            for index, asset in enumerate(active_assets, start=1):
                scene = asset.scene
                if scene is None:
                    raise ValueError("Active asset has no scene")
                visual_suffix = ".mp4" if asset.type is AssetType.VIDEO else ".png"
                visual_path = temporary_path / f"visual-{index}{visual_suffix}"
                storage.download_file(asset.b2_object_key, visual_path)
                speech = provider.generate_speech(
                    narration=scene.narration,
                    output_dir=temporary_path / "speech",
                )
                audio_path = temporary_path / f"narration-{index}.mp3"
                audio_path.write_bytes(speech.data)
                render_inputs.append(
                    RenderSceneInput(
                        visual_path=visual_path,
                        audio_path=audio_path,
                        narration=scene.narration,
                        duration_seconds=scene.duration_seconds,
                    )
                )
                job.progress = 10 + index * 10
                job.current_stage = "generating_narration"
                jobs.commit()

            output_path = temporary_path / f"render-v{render.version}.mp4"
            job.progress = 60
            job.current_stage = "rendering_video"
            jobs.commit()
            renderer.render(
                scenes=render_inputs,
                output_path=output_path,
                work_dir=temporary_path / "ffmpeg",
            )
            data = output_path.read_bytes()
            object_key = f"projects/{project.id}/renders/v{render.version}.mp4"
            storage.upload_file(object_key, output_path, "video/mp4")

        render.status = RenderStatus.COMPLETED
        render.b2_object_key = object_key
        render.duration_seconds = project.duration_seconds
        render.file_size_bytes = len(data)
        render.completed_at = utc_now()
        assets.add(
            Asset(
                project_id=project.id,
                scene_id=None,
                parent_asset_id=None,
                type=AssetType.FINAL_RENDER,
                version=render.version,
                status=AssetStatus.READY,
                provider="ffmpeg",
                model="ffmpeg",
                prompt=None,
                generation_instruction=None,
                b2_bucket=storage.bucket,
                b2_object_key=object_key,
                mime_type="video/mp4",
                file_size_bytes=len(data),
                sha256=hashlib.sha256(data).hexdigest(),
                provenance_object_key=None,
            )
        )
        project.status = ProjectStatus.READY
        project.generation_progress = 100
        job.status = JobStatus.COMPLETED
        job.progress = 100
        job.current_stage = "completed"
        job.completed_at = utc_now()
        jobs.commit()
    except Exception as error:
        session.rollback()
        failed_job = jobs.get(job_id)
        failed_render = renders.get(render_id)
        failed_project = projects.get(job.project_id)
        if failed_job is not None:
            failed_job.status = JobStatus.FAILED
            failed_job.current_stage = "failed"
            failed_job.error_code = "final_render_failed"
            failed_job.error_message = str(error)
            failed_job.completed_at = utc_now()
        if failed_render is not None:
            failed_render.status = RenderStatus.FAILED
        if failed_project is not None:
            failed_project.status = ProjectStatus.FAILED
        jobs.commit()
        raise
