from __future__ import annotations

import hashlib
import re
from decimal import Decimal
from pathlib import Path
from tempfile import TemporaryDirectory

from sqlalchemy.orm import Session

from app.billing.pricing import pricing
from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.database import session_scope
from app.core.ids import utc_now
from app.media import RenderMediaGateway, SceneMediaError, StoredMediaArtifact
from app.models.asset import Asset, AssetType
from app.models.credits import UsageOperation
from app.models.job import GenerationJob, JobStatus
from app.models.project import Project, ProjectStatus
from app.models.render import Render, RenderStatus
from app.providers import ProviderCapability
from app.providers.errors import ProviderError
from app.providers.factory import create_provider_factory
from app.providers.selection import payload_with_selections, selections_from_payload
from app.rendering import FFmpegComposer, RenderComposition, SceneMediaInput
from app.rendering.captions import CaptionScene, build_srt
from app.rendering.ffmpeg import RenderCompositionError
from app.repositories.billing import BillingRepository
from app.repositories.sqlalchemy import (
    AssetRepository,
    JobRepository,
    ProjectRepository,
    RenderRepository,
)
from app.services.credits import CreditService

_SAFE_SEGMENT = re.compile(r"[^a-zA-Z0-9_-]+")


def _safe_segment(value: str) -> str:
    label = _SAFE_SEGMENT.sub("-", value).strip("-_")[:48] or "resource"
    digest = hashlib.sha256(value.encode()).hexdigest()[:12]
    return f"{label}-{digest}"


def _set_stage(
    job: GenerationJob,
    *,
    stage: str,
    progress: int,
) -> None:
    job.current_stage = stage
    job.progress = progress
    job.updated_at = utc_now()


def _persist_artifact(
    repository: AssetRepository,
    *,
    project_id: str,
    scene_id: str | None,
    asset_type: AssetType,
    version: int,
    artifact: StoredMediaArtifact,
    prompt: str | None,
    purpose: str,
    configuration: str = "",
) -> Asset:
    return repository.create(
        project_id=project_id,
        scene_id=scene_id,
        asset_type=asset_type,
        version=version,
        provider=artifact.provider,
        model_name=artifact.model,
        prompt=prompt,
        generation_parameters={
            "purpose": purpose,
            "configuration": configuration,
        },
        storage_bucket=settings.b2_bucket_name,
        storage_object_key=artifact.storage_object_key,
        mime_type=artifact.media_type,
        file_size_bytes=artifact.file_size_bytes,
        sha256=artifact.sha256,
        provenance_object_key=artifact.manifest_object_key,
    )


def _extension(asset: Asset) -> str:
    if asset.type is AssetType.VIDEO:
        return ".mp4"
    if asset.mime_type == "image/png":
        return ".png"
    if asset.mime_type == "image/webp":
        return ".webp"
    if asset.mime_type == "audio/wav":
        return ".wav"
    return ".jpg" if asset.type is AssetType.IMAGE else ".mp3"


def execute_render_job(
    job_id: str,
    *,
    gateway: RenderMediaGateway | None = None,
    composer: FFmpegComposer | None = None,
) -> dict[str, object]:
    video_composer = composer or FFmpegComposer(
        binary=settings.ffmpeg_binary,
        timeout_seconds=settings.ffmpeg_timeout_seconds,
    )
    with session_scope() as session:
        jobs = JobRepository(session)
        projects = ProjectRepository(session)
        assets = AssetRepository(session)
        renders = RenderRepository(session)
        job = jobs.get_for_update(job_id)
        if job is None:
            return {"job_id": job_id, "status": "not_found"}
        render_id = job.input_payload.get("render_id")
        if job.status is JobStatus.CANCEL_REQUESTED:
            render = (
                renders.get(render_id, for_update=True)
                if isinstance(render_id, str)
                else None
            )
            project = projects.get(job.project_id)
            _cancel(job, render, project)
            CreditService(BillingRepository(session)).settle(job.id)
            session.commit()
            return {"job_id": job.id, "status": "cancelled"}
        if job.status is not JobStatus.QUEUED or not isinstance(render_id, str):
            return {"job_id": job.id, "status": job.status.value}
        render = renders.get(render_id, for_update=True)
        project = projects.get(job.project_id)
        if render is None or project is None:
            _fail(
                job,
                render,
                project,
                "render_not_found",
                "The queued render no longer exists.",
            )
            CreditService(BillingRepository(session)).settle(job.id)
            session.commit()
            return {"job_id": job.id, "status": "failed"}

        required_capabilities: list[ProviderCapability] = []
        if render.narration_enabled:
            required_capabilities.append(ProviderCapability.TTS)
        if render.music_enabled:
            required_capabilities.append(ProviderCapability.MUSIC)
        try:
            selections, legacy = selections_from_payload(
                job.input_payload,
                required_capabilities,
                settings,
            )
        except ProviderError as error:
            _fail(job, render, project, error.code, error.message)
            CreditService(BillingRepository(session)).settle(job.id)
            session.commit()
            return {"job_id": job.id, "status": "failed"}
        if legacy:
            job.input_payload = payload_with_selections(
                job.input_payload, selections
            )
            session.commit()
        media = gateway or create_provider_factory(settings).render_media(
            selections
        )

        job.status = JobStatus.RUNNING
        job.started_at = utc_now()
        render.status = RenderStatus.RENDERING
        render.started_at = utc_now()
        _set_stage(job, stage="preparing_assets", progress=5)
        session.commit()

        scenes = sorted(
            (
                scene
                for chapter in project.chapters
                for scene in chapter.scenes
            ),
            key=lambda scene: (scene.position, scene.id),
        )
        skipped: list[str] = []
        result_payload: dict[str, object] = {"render_id": render.id}
        try:
            with TemporaryDirectory(prefix="talemotion-render-") as temp:
                workspace = Path(temp)
                composition_scenes: list[SceneMediaInput] = []
                project_segment = _safe_segment(project.id)
                for index, scene in enumerate(scenes, start=1):
                    if _cancel_if_requested(session, job, render, project):
                        return {"job_id": job.id, "status": "cancelled"}
                    active = next(
                        asset
                        for asset in scene.assets
                        if asset.id == scene.active_asset_id
                    )
                    if not active.storage_object_key:
                        raise SceneMediaError(
                            "storage_failed",
                            "A scene asset has no storage object key.",
                            False,
                        )
                    scene_path = workspace / (
                        f"source-{index:02}{_extension(active)}"
                    )
                    scene_path.write_bytes(
                        media.download(active.storage_object_key)
                    )
                    narration_path: Path | None = None
                    if render.narration_enabled:
                        _set_stage(
                            job,
                            stage="generating_narration",
                            progress=10 + round(index / len(scenes) * 25),
                        )
                        session.commit()
                        narration_asset = assets.reusable_audio(
                            project_id=project.id,
                            scene_id=scene.id,
                            prompt=scene.narration,
                            provider=selections[ProviderCapability.TTS].provider,
                            model_name=selections[ProviderCapability.TTS].model,
                            purpose="narration",
                            configuration=(
                                f"{selections[ProviderCapability.TTS].provider}:"
                                f"{selections[ProviderCapability.TTS].model}:"
                                f"{settings.talemotion_tts_voice or 'default'}"
                            ),
                        )
                        if narration_asset is None:
                            artifact = media.generate_narration(
                                project_id=project.id,
                                scene_id=scene.id,
                                text=scene.narration,
                            )
                            narration_asset = _persist_artifact(
                                assets,
                                project_id=project.id,
                                scene_id=scene.id,
                                asset_type=AssetType.AUDIO,
                                version=assets.next_version(
                                    scene.id, AssetType.AUDIO
                                ),
                                artifact=artifact,
                                prompt=scene.narration,
                                purpose="narration",
                                configuration=(
                                    f"{selections[ProviderCapability.TTS].provider}:"
                                    f"{selections[ProviderCapability.TTS].model}:"
                                    f"{settings.talemotion_tts_voice or 'default'}"
                                ),
                            )
                            CreditService(
                                BillingRepository(session)
                            ).record_usage(
                                job=job,
                                operation=UsageOperation.TTS_GENERATION,
                                provider=selections[ProviderCapability.TTS].provider,
                                model_name=selections[ProviderCapability.TTS].model,
                                credits=pricing.rate(
                                    UsageOperation.TTS_GENERATION
                                ),
                                idempotency_key=(
                                    f"usage:{job.id}:tts:{scene.id}"
                                ),
                                input_units=Decimal(len(scene.narration)),
                                metadata={"asset_id": narration_asset.id},
                            )
                            session.commit()
                        if not narration_asset.storage_object_key:
                            raise SceneMediaError(
                                "storage_failed",
                                "Narration audio is unavailable in storage.",
                                False,
                            )
                        narration_path = workspace / f"voice-{index:02}.mp3"
                        narration_path.write_bytes(
                            media.download(narration_asset.storage_object_key)
                        )
                    composition_scenes.append(
                        SceneMediaInput(
                            path=scene_path,
                            kind=active.type.value,
                            duration_seconds=scene.duration_seconds,
                            narration_path=narration_path,
                        )
                    )
                if not render.narration_enabled:
                    skipped.append("generating_narration")

                music_path: Path | None = None
                if render.music_enabled:
                    if _cancel_if_requested(session, job, render, project):
                        return {"job_id": job.id, "status": "cancelled"}
                    _set_stage(job, stage="generating_music", progress=45)
                    session.commit()
                    music_prompt = (
                        f"Instrumental background score for {project.title}, "
                        f"a {project.mode.value} in {project.visual_style}; "
                        f"{project.narration_style} pacing; no vocals."
                    )
                    music_asset = assets.reusable_audio(
                        project_id=project.id,
                        scene_id=None,
                        prompt=music_prompt,
                        provider=selections[ProviderCapability.MUSIC].provider,
                        model_name=selections[ProviderCapability.MUSIC].model,
                        purpose="background_music",
                        configuration=(
                            f"{selections[ProviderCapability.MUSIC].provider}:"
                            f"{selections[ProviderCapability.MUSIC].model}"
                        ),
                    )
                    if music_asset is None:
                        artifact = media.generate_music(
                            project_id=project.id,
                            prompt=music_prompt,
                            duration_seconds=project.duration_seconds,
                        )
                        music_asset = _persist_artifact(
                            assets,
                            project_id=project.id,
                            scene_id=None,
                            asset_type=AssetType.AUDIO,
                            version=assets.next_project_version(
                                project.id, AssetType.AUDIO
                            ),
                            artifact=artifact,
                            prompt=music_prompt,
                            purpose="background_music",
                            configuration=(
                                f"{selections[ProviderCapability.MUSIC].provider}:"
                                f"{selections[ProviderCapability.MUSIC].model}"
                            ),
                        )
                        CreditService(
                            BillingRepository(session)
                        ).record_usage(
                            job=job,
                            operation=UsageOperation.MUSIC_GENERATION,
                            provider=selections[ProviderCapability.MUSIC].provider,
                            model_name=selections[ProviderCapability.MUSIC].model,
                            credits=pricing.rate(
                                UsageOperation.MUSIC_GENERATION
                            ),
                            idempotency_key=f"usage:{job.id}:music",
                            input_units=Decimal(project.duration_seconds),
                            metadata={"asset_id": music_asset.id},
                        )
                        session.commit()
                    if not music_asset.storage_object_key:
                        raise SceneMediaError(
                            "storage_failed",
                            "Background music is unavailable in storage.",
                            False,
                        )
                    music_path = workspace / "music.mp3"
                    music_path.write_bytes(
                        media.download(music_asset.storage_object_key)
                    )
                else:
                    skipped.append("generating_music")

                captions_path: Path | None = None
                if render.captions_enabled:
                    if _cancel_if_requested(session, job, render, project):
                        return {"job_id": job.id, "status": "cancelled"}
                    _set_stage(job, stage="building_subtitles", progress=55)
                    session.commit()
                    subtitle_bytes = build_srt(
                        [
                            CaptionScene(
                                narration=scene.narration,
                                duration_seconds=scene.duration_seconds,
                            )
                            for scene in scenes
                        ]
                    ).encode()
                    captions_path = workspace / "captions.srt"
                    captions_path.write_bytes(subtitle_bytes)
                    subtitle_key = (
                        f"talemotion/projects/{project_segment}/subtitles/"
                        f"render-v{render.version}.srt"
                    )
                    subtitle_artifact = media.upload(
                        key=subtitle_key,
                        data=subtitle_bytes,
                        media_type="application/x-subrip",
                    )
                    subtitle_asset = _persist_artifact(
                        assets,
                        project_id=project.id,
                        scene_id=None,
                        asset_type=AssetType.SUBTITLE,
                        version=assets.next_project_version(
                            project.id, AssetType.SUBTITLE
                        ),
                        artifact=subtitle_artifact,
                        prompt=None,
                        purpose="render_captions",
                    )
                    result_payload["subtitle_asset_id"] = subtitle_asset.id
                    session.commit()
                else:
                    skipped.append("building_subtitles")

                _set_stage(job, stage="composing_video", progress=70)
                session.commit()
                if _cancel_if_requested(session, job, render, project):
                    return {"job_id": job.id, "status": "cancelled"}
                final_path = workspace / "final.mp4"
                video_composer.compose(
                    RenderComposition(
                        scenes=composition_scenes,
                        output_path=final_path,
                        workspace=workspace,
                        music_path=music_path,
                        captions_path=captions_path,
                    )
                )
                _set_stage(job, stage="uploading_final_video", progress=90)
                session.commit()
                if _cancel_if_requested(session, job, render, project):
                    return {"job_id": job.id, "status": "cancelled"}
                final_bytes = final_path.read_bytes()
                final_key = (
                    f"talemotion/projects/{project_segment}/renders/"
                    f"v{render.version}/final.mp4"
                )
                final_artifact = media.upload(
                    key=final_key,
                    data=final_bytes,
                    media_type="video/mp4",
                )
                final_asset = _persist_artifact(
                    assets,
                    project_id=project.id,
                    scene_id=None,
                    asset_type=AssetType.FINAL_VIDEO,
                    version=render.version,
                    artifact=final_artifact,
                    prompt=None,
                    purpose="final_render",
                )
                CreditService(BillingRepository(session)).record_usage(
                    job=job,
                    operation=UsageOperation.FINAL_RENDER,
                    provider="ffmpeg",
                    model_name=settings.ffmpeg_binary,
                    credits=pricing.rate(UsageOperation.FINAL_RENDER),
                    idempotency_key=f"usage:{job.id}:final-render",
                    input_units=Decimal(len(scenes)),
                    output_units=Decimal(project.duration_seconds),
                    metadata={"asset_id": final_asset.id},
                )
                render.asset_id = final_asset.id
                render.duration_seconds = sum(
                    scene.duration_seconds for scene in scenes
                )
                render.file_size_bytes = len(final_bytes)
                render.status = RenderStatus.COMPLETED
                render.completed_at = utc_now()
                job.status = JobStatus.COMPLETED
                job.completed_at = utc_now()
                _set_stage(job, stage="completed", progress=100)
                result_payload.update(
                    {
                        "render_id": render.id,
                        "asset_id": final_asset.id,
                        "skipped_stages": skipped,
                    }
                )
                job.result_payload = result_payload
                project.status = ProjectStatus.READY
                project.generation_progress = 100
                CreditService(BillingRepository(session)).settle(job.id)
                session.commit()
                return {
                    "job_id": job.id,
                    "status": "completed",
                    **result_payload,
                }
        except (SceneMediaError, RenderCompositionError) as error:
            code = (
                error.code
                if isinstance(error, SceneMediaError)
                else error.code
            )
            message = (
                error.message
                if isinstance(error, SceneMediaError)
                else "FFmpeg could not compose the final video."
            )
            _fail(job, render, project, code, message)
            CreditService(BillingRepository(session)).settle(job.id)
            session.commit()
            return {"job_id": job.id, "status": "failed"}
        except Exception:
            _fail(
                job,
                render,
                project,
                "unknown_error",
                "Final video rendering failed unexpectedly.",
            )
            CreditService(BillingRepository(session)).settle(job.id)
            session.commit()
            return {"job_id": job.id, "status": "failed"}


def _fail(
    job: GenerationJob,
    render: Render | None,
    project: Project | None,
    code: str,
    message: str,
) -> None:
    job.status = JobStatus.FAILED
    job.current_stage = "failed"
    job.error_code = code
    job.error_message = message
    job.completed_at = utc_now()
    job.updated_at = utc_now()
    if render is not None:
        render.status = RenderStatus.FAILED
        render.completed_at = utc_now()
    if project is not None:
        project.status = ProjectStatus.FAILED


def _cancel(
    job: GenerationJob,
    render: Render | None,
    project: Project | None,
) -> None:
    job.status = JobStatus.CANCELLED
    job.current_stage = "cancelled"
    job.completed_at = utc_now()
    job.updated_at = utc_now()
    if render is not None:
        render.status = RenderStatus.CANCELLED
        render.completed_at = utc_now()
    if project is not None:
        project.status = ProjectStatus.READY


def _cancel_if_requested(
    session: Session,
    job: GenerationJob,
    render: Render,
    project: Project,
) -> bool:
    session.refresh(job)
    if job.status is not JobStatus.CANCEL_REQUESTED:
        return False
    _cancel(job, render, project)
    CreditService(BillingRepository(session)).settle(job.id)
    session.commit()
    return True


@celery_app.task(name="app.tasks.rendering.render_project_video")
def render_project_video(job_id: str) -> dict[str, object]:
    return execute_render_job(job_id)
