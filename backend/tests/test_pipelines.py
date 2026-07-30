import json
from pathlib import Path

import pytest
from pydantic import SecretStr
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import AppConfig
from app.integrations.ffmpeg import RenderSceneInput
from app.integrations.genblaze import (
    GeneratedMedia,
    StoryboardOutput,
    StoryboardScene,
)
from app.models.asset import Asset
from app.models.chapter import Chapter
from app.models.job import GenerationJob, JobStatus, JobType
from app.models.project import AspectRatio, Project, ProjectStatus, VideoMode
from app.models.render import Render, RenderStatus
from app.pipelines.media import run_media_pipeline
from app.pipelines.rendering import run_render_pipeline
from app.pipelines.storyboard import run_storyboard_pipeline
from app.repositories.sqlalchemy import AssetRepository


class FakeProvider:
    def __init__(self, *, fail_images: bool = False) -> None:
        self.fail_images = fail_images

    def generate_storyboard(self, **_kwargs: object) -> StoryboardOutput:
        return StoryboardOutput(
            scenes=tuple(
                StoryboardScene(
                    title=f"Scene {position}",
                    narration=f"Historical narration for scene {position}.",
                    visual_prompt=f"Historically grounded vertical scene {position}",
                    duration_seconds=8 if position < 4 else 6,
                    position=position,
                )
                for position in range(1, 5)
            )
        )

    def generate_image(self, *, prompt: str, output_dir: Path) -> GeneratedMedia:
        if self.fail_images:
            raise RuntimeError("provider unavailable")
        output_dir.mkdir(parents=True, exist_ok=True)
        return GeneratedMedia(
            data=b"\x89PNG\r\n\x1a\nfake-image",
            mime_type="image/png",
            provider="fake-openai",
            model="fake-image-model",
            generation_parameters={"size": "1024x1536"},
            genblaze_provenance={"run_id": "fake-run"},
        )

    def generate_speech(
        self,
        *,
        narration: str,
        output_dir: Path,
    ) -> GeneratedMedia:
        output_dir.mkdir(parents=True, exist_ok=True)
        return GeneratedMedia(
            data=b"fake-mp3",
            mime_type="audio/mpeg",
            provider="fake-openai",
            model="fake-tts-model",
            generation_parameters={"voice": "alloy"},
        )


class FakeStorage:
    bucket = "talemotion-test"

    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    def upload_bytes(self, key: str, data: bytes, content_type: str) -> None:
        self.objects[key] = data

    def upload_file(self, key: str, path: Path, content_type: str) -> None:
        self.objects[key] = path.read_bytes()

    def download_file(self, key: str, destination: Path) -> None:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(self.objects[key])

    def delete_object(self, key: str) -> None:
        self.objects.pop(key, None)

    def exists(self, key: str) -> bool:
        return key in self.objects

    def signed_url(self, key: str, *, download: bool = False):
        raise NotImplementedError


class FakeRenderer:
    def render(
        self,
        *,
        scenes: list[RenderSceneInput],
        output_path: Path,
        work_dir: Path,
    ) -> None:
        assert len(scenes) == 4
        work_dir.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"\x00\x00\x00\x18ftypmp42fake-mp4")


def seed_project(session: Session) -> Project:
    project = Project(
        mode=VideoMode.HISTORICAL_DOCUMENTARY,
        status=ProjectStatus.DRAFT,
        title="Majapahit",
        topic="The rise of Majapahit",
        additional_direction="Focus on maritime power.",
        source_notes="Avoid invented quotations.",
        language="English",
        duration_seconds=30,
        aspect_ratio=AspectRatio.VERTICAL,
        captions_enabled=True,
        music_enabled=False,
    )
    project.chapters.append(Chapter(title="Main", position=1))
    session.add(project)
    session.commit()
    return project


def run_storyboard(session: Session, project: Project) -> GenerationJob:
    job = GenerationJob(
        project_id=project.id,
        type=JobType.STORYBOARD,
        status=JobStatus.QUEUED,
        progress=0,
        current_stage="queued",
        input_data={},
    )
    session.add(job)
    session.commit()
    run_storyboard_pipeline(
        session,
        job_id=job.id,
        provider=FakeProvider(),
    )
    session.refresh(job)
    return job


def test_storyboard_pipeline_persists_exactly_four_scenes(
    session_factory: sessionmaker[Session],
) -> None:
    with session_factory() as session:
        project = seed_project(session)
        job = run_storyboard(session, project)

        session.refresh(project)
        assert job.status is JobStatus.COMPLETED
        assert project.status is ProjectStatus.STORYBOARD_READY
        assert len(project.chapters[0].scenes) == 4
        assert [scene.position for scene in project.chapters[0].scenes] == [
            1,
            2,
            3,
            4,
        ]
        assert sum(
            scene.duration_seconds for scene in project.chapters[0].scenes
        ) == 30


def test_media_pipeline_uploads_asset_manifest_and_versions_regeneration(
    session_factory: sessionmaker[Session],
    tmp_path: Path,
) -> None:
    storage = FakeStorage()
    with session_factory() as session:
        project = seed_project(session)
        run_storyboard(session, project)
        scene = project.chapters[0].scenes[0]

        first_job = GenerationJob(
            project_id=project.id,
            scene_id=scene.id,
            type=JobType.SCENE_GENERATION,
            status=JobStatus.QUEUED,
            progress=0,
            current_stage="queued",
            input_data={},
        )
        session.add(first_job)
        session.commit()
        run_media_pipeline(
            session,
            job_id=first_job.id,
            provider=FakeProvider(),
            storage=storage,
            work_dir=tmp_path,
        )

        second_job = GenerationJob(
            project_id=project.id,
            scene_id=scene.id,
            type=JobType.SCENE_REGENERATION,
            status=JobStatus.QUEUED,
            progress=0,
            current_stage="queued",
            input_data={
                "additional_instruction": (
                    "Use larger Southeast Asian ships and avoid European vessels."
                )
            },
        )
        session.add(second_job)
        session.commit()
        run_media_pipeline(
            session,
            job_id=second_job.id,
            provider=FakeProvider(),
            storage=storage,
            work_dir=tmp_path,
        )

        assets = AssetRepository(session).list(scene_id=scene.id)
        assets.sort(key=lambda asset: asset.version)
        assert [asset.version for asset in assets] == [1, 2]
        assert assets[1].parent_asset_id == assets[0].id
        assert scene.active_asset_version == 2
        assert assets[0].b2_object_key in storage.objects
        assert assets[1].b2_object_key in storage.objects
        manifest = json.loads(
            storage.objects[assets[1].provenance_object_key or ""]
        )
        assert manifest["sha256"] == assets[1].sha256
        assert manifest["parent_asset_id"] == assets[0].id
        assert "does not prove" in manifest["disclaimer"]


def test_failed_provider_is_persisted_on_job_and_scene(
    session_factory: sessionmaker[Session],
    tmp_path: Path,
) -> None:
    with session_factory() as session:
        project = seed_project(session)
        run_storyboard(session, project)
        scene = project.chapters[0].scenes[0]
        job = GenerationJob(
            project_id=project.id,
            scene_id=scene.id,
            type=JobType.SCENE_GENERATION,
            status=JobStatus.QUEUED,
            progress=0,
            current_stage="queued",
            input_data={},
        )
        session.add(job)
        session.commit()

        with pytest.raises(RuntimeError, match="provider unavailable"):
            run_media_pipeline(
                session,
                job_id=job.id,
                provider=FakeProvider(fail_images=True),
                storage=FakeStorage(),
                work_dir=tmp_path,
            )

        session.refresh(job)
        session.refresh(scene)
        assert job.status is JobStatus.FAILED
        assert job.error_code == "scene_generation_failed"
        assert scene.status.value == "failed"


def test_render_pipeline_orchestrates_four_assets_and_uploads_mp4(
    session_factory: sessionmaker[Session],
    tmp_path: Path,
) -> None:
    storage = FakeStorage()
    with session_factory() as session:
        project = seed_project(session)
        run_storyboard(session, project)
        for scene in project.chapters[0].scenes:
            job = GenerationJob(
                project_id=project.id,
                scene_id=scene.id,
                type=JobType.SCENE_GENERATION,
                status=JobStatus.QUEUED,
                progress=0,
                current_stage="queued",
                input_data={},
            )
            session.add(job)
            session.commit()
            run_media_pipeline(
                session,
                job_id=job.id,
                provider=FakeProvider(),
                storage=storage,
                work_dir=tmp_path,
            )

        render = Render(
            project_id=project.id,
            version=1,
            status=RenderStatus.QUEUED,
        )
        session.add(render)
        session.flush()
        render_job = GenerationJob(
            project_id=project.id,
            type=JobType.FINAL_RENDER,
            status=JobStatus.QUEUED,
            progress=0,
            current_stage="queued",
            input_data={"render_id": render.id},
        )
        session.add(render_job)
        session.commit()
        config = AppConfig(
            openai_api_key=SecretStr("test"),
            media_work_dir=tmp_path,
        )

        run_render_pipeline(
            session,
            job_id=render_job.id,
            provider=FakeProvider(),
            storage=storage,
            renderer=FakeRenderer(),
            config=config,
        )

        session.refresh(render)
        session.refresh(render_job)
        assert render.status is RenderStatus.COMPLETED
        assert render_job.status is JobStatus.COMPLETED
        assert render.b2_object_key in storage.objects
        stored = session.query(Asset).filter_by(project_id=project.id).all()
        assert any(asset.type.value == "final_render" for asset in stored)
