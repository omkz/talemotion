import hashlib
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.ids import new_resource_id, utc_now
from app.integrations.genblaze import GenerationProvider
from app.integrations.provenance import ProvenanceManifest
from app.integrations.storage import ObjectStorage
from app.models.asset import Asset, AssetStatus, AssetType
from app.models.job import JobStatus, JobType
from app.models.scene import SceneStatus
from app.repositories.sqlalchemy import (
    AssetRepository,
    JobRepository,
    ProjectRepository,
)

MIME_EXTENSIONS = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "video/mp4": "mp4",
}


def run_media_pipeline(
    session: Session,
    *,
    job_id: str,
    provider: GenerationProvider,
    storage: ObjectStorage,
    work_dir: Path,
) -> None:
    jobs = JobRepository(session)
    projects = ProjectRepository(session)
    assets = AssetRepository(session)
    job = jobs.get(job_id)
    if job is None or job.scene_id is None:
        raise ValueError(f"Unknown scene-generation job {job_id}")
    scene = projects.get_scene(job.scene_id)
    if scene is None:
        raise ValueError(f"Unknown scene {job.scene_id}")

    job.status = JobStatus.RUNNING
    job.started_at = utc_now()
    job.progress = 10
    job.current_stage = "generating_image"
    scene.status = SceneStatus.GENERATING_IMAGE
    jobs.commit()

    uploaded_key: str | None = None
    try:
        instruction = job.input_data.get("additional_instruction")
        prompt = scene.visual_prompt
        if isinstance(instruction, str) and instruction.strip():
            prompt = f"{prompt}\nRevision instruction: {instruction.strip()}"
        generated = provider.generate_image(prompt=prompt, output_dir=work_dir)
        sha256 = hashlib.sha256(generated.data).hexdigest()
        version = assets.next_version(scene.id)
        parent_asset = (
            assets.get_scene_version(scene.id, scene.active_asset_version)
            if scene.active_asset_version > 0
            else None
        )
        asset_id = new_resource_id("asset")
        extension = MIME_EXTENSIONS.get(generated.mime_type, "bin")
        kind = "video" if generated.mime_type == "video/mp4" else "images"
        object_key = (
            f"projects/{job.project_id}/scenes/{scene.id}/{kind}/"
            f"v{version}.{extension}"
        )
        manifest_key = (
            f"projects/{job.project_id}/scenes/{scene.id}/manifests/"
            f"v{version}.json"
        )

        job.progress = 70
        job.current_stage = "uploading_assets"
        scene.status = SceneStatus.UPLOADING_ASSETS
        jobs.commit()
        storage.upload_bytes(object_key, generated.data, generated.mime_type)
        uploaded_key = object_key
        manifest = ProvenanceManifest(
            asset_id=asset_id,
            project_id=job.project_id,
            scene_id=scene.id,
            asset_version=version,
            provider=generated.provider,
            model=generated.model,
            prompt=prompt,
            generation_parameters=generated.generation_parameters,
            generated_at=utc_now(),
            sha256=sha256,
            b2_object_key=object_key,
            parent_asset_id=parent_asset.id if parent_asset else None,
            genblaze_provenance=generated.genblaze_provenance,
        )
        storage.upload_bytes(
            manifest_key,
            manifest.model_dump_json(indent=2).encode(),
            "application/json",
        )
        asset = Asset(
            id=asset_id,
            project_id=job.project_id,
            scene_id=scene.id,
            parent_asset_id=parent_asset.id if parent_asset else None,
            type=(
                AssetType.VIDEO
                if generated.mime_type == "video/mp4"
                else AssetType.IMAGE
            ),
            version=version,
            status=AssetStatus.READY,
            provider=generated.provider,
            model=generated.model,
            prompt=prompt,
            generation_instruction=(
                instruction.strip()
                if isinstance(instruction, str) and instruction.strip()
                else None
            ),
            b2_bucket=storage.bucket,
            b2_object_key=object_key,
            mime_type=generated.mime_type,
            file_size_bytes=len(generated.data),
            sha256=sha256,
            provenance_object_key=manifest_key,
        )
        assets.add(asset)
        scene.active_asset_version = version
        scene.status = SceneStatus.COMPLETED
        scene.updated_at = utc_now()
        job.status = JobStatus.COMPLETED
        job.progress = 100
        job.current_stage = "completed"
        job.completed_at = utc_now()
        assets.commit()
    except Exception as error:
        session.rollback()
        if uploaded_key is not None:
            try:
                storage.delete_object(uploaded_key)
            except Exception:
                pass
        failed_job = jobs.get(job_id)
        failed_scene = projects.get_scene(job.scene_id)
        if failed_job is not None:
            failed_job.status = JobStatus.FAILED
            failed_job.current_stage = "failed"
            failed_job.error_code = (
                "scene_regeneration_failed"
                if job.type is JobType.SCENE_REGENERATION
                else "scene_generation_failed"
            )
            failed_job.error_message = str(error)
            failed_job.completed_at = utc_now()
        if failed_scene is not None:
            failed_scene.status = SceneStatus.FAILED
        jobs.commit()
        raise
