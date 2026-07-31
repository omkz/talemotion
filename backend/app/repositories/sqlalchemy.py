from __future__ import annotations

from datetime import datetime

from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.asset import Asset, AssetStatus, AssetType
from app.models.chapter import Chapter
from app.models.job import GenerationJob, JobStatus, JobType
from app.models.project import Project, ProjectStatus, VideoMode
from app.models.render import Render, RenderStatus
from app.models.scene import Scene


def _project_graph() -> tuple[object, ...]:
    return (
        selectinload(Project.chapters)
        .selectinload(Chapter.scenes)
        .selectinload(Scene.assets),
        selectinload(Project.chapters)
        .selectinload(Chapter.scenes)
        .selectinload(Scene.jobs),
    )


class ProjectRepository:
    def __init__(self, session: Session, user_id: str | None = None) -> None:
        self.session = session
        self.user_id = user_id

    def add(self, project: Project) -> Project:
        if self.user_id is not None:
            project.user_id = self.user_id
        self.session.add(project)
        self.session.flush()
        self.session.refresh(project)
        return self.get(project.id, include_deleted=True) or project

    def get(self, project_id: str, *, include_deleted: bool = False) -> Project | None:
        statement = (
            select(Project)
            .where(Project.id == project_id)
            .options(*_project_graph())
        )
        if not include_deleted:
            statement = statement.where(Project.status != ProjectStatus.DELETED)
        if self.user_id is not None:
            statement = statement.where(Project.user_id == self.user_id)
        return self.session.scalar(statement)

    def get_for_update(self, project_id: str) -> Project | None:
        statement = (
            select(Project)
            .where(
                Project.id == project_id,
                Project.status != ProjectStatus.DELETED,
            )
            .options(*_project_graph())
            .with_for_update()
        )
        if self.user_id is not None:
            statement = statement.where(Project.user_id == self.user_id)
        return self.session.scalar(statement)

    def list(
        self,
        *,
        status: ProjectStatus | None = None,
        mode: VideoMode | None = None,
        search: str | None = None,
    ) -> list[Project]:
        statement: Select[tuple[Project]] = (
            select(Project)
            .where(Project.status != ProjectStatus.DELETED)
            .options(*_project_graph())
            .order_by(Project.created_at.desc(), Project.id.desc())
        )
        if status is not None:
            statement = statement.where(Project.status == status)
        if mode is not None:
            statement = statement.where(Project.mode == mode)
        if search:
            term = f"%{search.strip()}%"
            statement = statement.where(
                or_(
                    Project.title.ilike(term),
                    Project.topic.ilike(term),
                )
            )
        if self.user_id is not None:
            statement = statement.where(Project.user_id == self.user_id)
        return list(self.session.scalars(statement).unique())

    def get_chapter(
        self, chapter_id: str, *, for_update: bool = False
    ) -> Chapter | None:
        statement = (
            select(Chapter)
            .where(Chapter.id == chapter_id)
            .options(
                selectinload(Chapter.project),
                selectinload(Chapter.scenes).selectinload(Scene.assets),
                selectinload(Chapter.scenes).selectinload(Scene.jobs),
            )
        )
        if for_update:
            statement = statement.with_for_update()
        if self.user_id is not None:
            statement = statement.where(
                Chapter.project.has(Project.user_id == self.user_id)
            )
        return self.session.scalar(statement)

    def get_scene(self, scene_id: str) -> Scene | None:
        statement = (
            select(Scene)
            .where(Scene.id == scene_id)
            .options(
                selectinload(Scene.chapter).selectinload(Chapter.project),
                selectinload(Scene.assets),
                selectinload(Scene.jobs),
            )
        )
        if self.user_id is not None:
            statement = statement.where(
                Scene.chapter.has(
                    Chapter.project.has(Project.user_id == self.user_id)
                )
            )
        return self.session.scalar(statement)

    def delete_chapter_scenes(self, chapter: Chapter) -> None:
        chapter.scenes.clear()
        self.session.flush()

    def commit(self) -> None:
        self.session.commit()

    def rollback(self) -> None:
        self.session.rollback()


class JobRepository:
    def __init__(self, session: Session, user_id: str | None = None) -> None:
        self.session = session
        self.user_id = user_id

    def create(
        self,
        *,
        project_id: str,
        job_type: JobType,
        scene_id: str | None = None,
        parent_job_id: str | None = None,
        current_stage: str = "queued",
        input_payload: dict[str, object] | None = None,
        retry_count: int = 0,
        max_retries: int = 2,
        idempotency_key: str | None = None,
    ) -> GenerationJob:
        owner_id = self.user_id or self.session.scalar(
            select(Project.user_id).where(Project.id == project_id)
        )
        if owner_id is None:
            raise ValueError("A generation job requires an owning project.")
        job = GenerationJob(
            user_id=owner_id,
            project_id=project_id,
            scene_id=scene_id,
            parent_job_id=parent_job_id,
            type=job_type,
            status=JobStatus.QUEUED,
            progress=0,
            current_stage=current_stage,
            input_payload=input_payload or {},
            retry_count=retry_count,
            max_retries=max_retries,
            idempotency_key=idempotency_key,
        )
        self.session.add(job)
        self.session.flush()
        return job

    def get(self, job_id: str) -> GenerationJob | None:
        statement = (
            select(GenerationJob)
            .where(GenerationJob.id == job_id)
            .options(
                selectinload(GenerationJob.children),
                selectinload(GenerationJob.scene).selectinload(Scene.chapter),
            )
        )
        if self.user_id is not None:
            statement = statement.where(GenerationJob.user_id == self.user_id)
        return self.session.scalar(statement)

    def get_for_update(self, job_id: str) -> GenerationJob | None:
        statement = (
            select(GenerationJob)
            .where(GenerationJob.id == job_id)
            .with_for_update()
        )
        if self.user_id is not None:
            statement = statement.where(GenerationJob.user_id == self.user_id)
        return self.session.scalar(statement)

    def by_idempotency_key(self, key: str) -> GenerationJob | None:
        statement = (
            select(GenerationJob)
            .where(GenerationJob.idempotency_key == key)
            .options(
                selectinload(GenerationJob.children),
                selectinload(GenerationJob.scene).selectinload(Scene.chapter),
            )
        )
        if self.user_id is not None:
            statement = statement.where(GenerationJob.user_id == self.user_id)
        return self.session.scalar(statement)

    def lock_idempotency_key(self, key: str) -> None:
        self.session.execute(
            select(func.pg_advisory_xact_lock(func.hashtext(key)))
        )

    def list_for_project(
        self,
        project_id: str,
        *,
        active_only: bool = False,
    ) -> list[GenerationJob]:
        statement = (
            select(GenerationJob)
            .where(GenerationJob.project_id == project_id)
            .options(
                selectinload(GenerationJob.children),
                selectinload(GenerationJob.scene).selectinload(Scene.chapter),
            )
            .order_by(
                GenerationJob.created_at.desc(),
                GenerationJob.id.desc(),
            )
        )
        if active_only:
            statement = statement.where(
                GenerationJob.status.in_(
                    (
                        JobStatus.QUEUED,
                        JobStatus.RUNNING,
                        JobStatus.CANCEL_REQUESTED,
                    )
                )
            )
        if self.user_id is not None:
            statement = statement.where(GenerationJob.user_id == self.user_id)
        return list(self.session.scalars(statement).unique())

    def stale_jobs(
        self,
        *,
        queued_before: datetime,
        running_before: datetime,
    ) -> list[GenerationJob]:
        return list(
            self.session.scalars(
                select(GenerationJob)
                .where(
                    or_(
                        and_(
                            GenerationJob.status == JobStatus.QUEUED,
                            GenerationJob.created_at < queued_before,
                        ),
                        and_(
                            GenerationJob.status.in_(
                                (
                                    JobStatus.RUNNING,
                                    JobStatus.CANCEL_REQUESTED,
                                )
                            ),
                            GenerationJob.updated_at < running_before,
                        ),
                    )
                )
                .with_for_update(skip_locked=True)
            )
        )

    def active_for_scene(self, scene_id: str) -> GenerationJob | None:
        statement = (
            select(GenerationJob)
            .where(
                GenerationJob.scene_id == scene_id,
                GenerationJob.status.in_(
                    (
                        JobStatus.QUEUED,
                        JobStatus.RUNNING,
                        JobStatus.CANCEL_REQUESTED,
                    )
                ),
            )
            .order_by(GenerationJob.created_at.desc())
        )
        if self.user_id is not None:
            statement = statement.where(GenerationJob.user_id == self.user_id)
        return self.session.scalar(statement)

    def active_for_project(
        self,
        project_id: str,
        job_type: JobType,
    ) -> GenerationJob | None:
        statement = (
            select(GenerationJob)
            .where(
                GenerationJob.project_id == project_id,
                GenerationJob.type == job_type,
                GenerationJob.status.in_(
                    (
                        JobStatus.QUEUED,
                        JobStatus.RUNNING,
                        JobStatus.CANCEL_REQUESTED,
                    )
                ),
            )
            .order_by(GenerationJob.created_at.desc())
        )
        if self.user_id is not None:
            statement = statement.where(GenerationJob.user_id == self.user_id)
        return self.session.scalar(statement)

    def children(self, parent_job_id: str) -> list[GenerationJob]:
        statement = (
            select(GenerationJob)
                .where(GenerationJob.parent_job_id == parent_job_id)
                .order_by(
                    GenerationJob.created_at.asc(),
                    GenerationJob.id.asc(),
                )
        )
        if self.user_id is not None:
            statement = statement.where(GenerationJob.user_id == self.user_id)
        return list(self.session.scalars(statement))

    def latest_children(self, parent_job_id: str) -> list[GenerationJob]:
        latest: dict[str, GenerationJob] = {}
        for child in reversed(self.children(parent_job_id)):
            if child.scene_id and child.scene_id not in latest:
                latest[child.scene_id] = child
        return sorted(
            latest.values(),
            key=lambda child: (child.created_at, child.id),
        )

    def commit(self) -> None:
        self.session.commit()


class AssetRepository:
    def __init__(self, session: Session, user_id: str | None = None) -> None:
        self.session = session
        self.user_id = user_id

    def get(self, asset_id: str) -> Asset | None:
        statement = select(Asset).where(Asset.id == asset_id)
        if self.user_id is not None:
            statement = statement.where(Asset.user_id == self.user_id)
        return self.session.scalar(statement)

    def next_version(self, scene_id: str, asset_type: AssetType) -> int:
        statement = select(func.max(Asset.version)).where(
            Asset.scene_id == scene_id,
            Asset.type == asset_type,
        )
        if self.user_id is not None:
            statement = statement.where(Asset.user_id == self.user_id)
        latest = self.session.scalar(statement)
        return (latest or 0) + 1

    def next_project_version(
        self,
        project_id: str,
        asset_type: AssetType,
    ) -> int:
        statement = select(func.max(Asset.version)).where(
            Asset.project_id == project_id,
            Asset.scene_id.is_(None),
            Asset.type == asset_type,
        )
        if self.user_id is not None:
            statement = statement.where(Asset.user_id == self.user_id)
        latest = self.session.scalar(statement)
        return (latest or 0) + 1

    def reusable_audio(
        self,
        *,
        project_id: str,
        scene_id: str | None,
        prompt: str,
        provider: str,
        model_name: str,
        purpose: str,
        configuration: str,
    ) -> Asset | None:
        statement = (
            select(Asset)
            .where(
                Asset.project_id == project_id,
                Asset.scene_id == scene_id,
                Asset.type == AssetType.AUDIO,
                Asset.status == AssetStatus.AVAILABLE,
                Asset.prompt == prompt,
                Asset.provider == provider,
                Asset.model_name == model_name,
                Asset.generation_parameters["purpose"].astext == purpose,
                Asset.generation_parameters["configuration"].astext
                == configuration,
            )
            .order_by(Asset.created_at.desc())
        )
        if self.user_id is not None:
            statement = statement.where(Asset.user_id == self.user_id)
        return self.session.scalar(statement)

    def create(
        self,
        *,
        project_id: str,
        scene_id: str | None,
        asset_type: AssetType,
        version: int,
        provider: str | None,
        model_name: str | None,
        prompt: str | None,
        generation_parameters: dict[str, object],
        storage_bucket: str | None,
        storage_object_key: str,
        mime_type: str,
        file_size_bytes: int | None,
        sha256: str | None,
        provenance_object_key: str | None,
        parent_asset_id: str | None = None,
    ) -> Asset:
        owner_id = self.user_id or self.session.scalar(
            select(Project.user_id).where(Project.id == project_id)
        )
        if owner_id is None:
            raise ValueError("An asset requires an owning project.")
        asset = Asset(
            user_id=owner_id,
            project_id=project_id,
            scene_id=scene_id,
            type=asset_type,
            status=AssetStatus.AVAILABLE,
            version=version,
            provider=provider,
            model_name=model_name,
            prompt=prompt,
            generation_parameters=generation_parameters,
            storage_bucket=storage_bucket,
            storage_object_key=storage_object_key,
            mime_type=mime_type,
            file_size_bytes=file_size_bytes,
            sha256=sha256,
            provenance_object_key=provenance_object_key,
            parent_asset_id=parent_asset_id,
        )
        self.session.add(asset)
        self.session.flush()
        return asset

    def commit(self) -> None:
        self.session.commit()


class RenderRepository:
    def __init__(self, session: Session, user_id: str | None = None) -> None:
        self.session = session
        self.user_id = user_id

    def create(
        self,
        *,
        project_id: str,
        version: int,
        narration_enabled: bool,
        captions_enabled: bool,
        music_enabled: bool,
    ) -> Render:
        owner_id = self.user_id or self.session.scalar(
            select(Project.user_id).where(Project.id == project_id)
        )
        if owner_id is None:
            raise ValueError("A render requires an owning project.")
        render = Render(
            user_id=owner_id,
            project_id=project_id,
            version=version,
            status=RenderStatus.QUEUED,
            narration_enabled=narration_enabled,
            captions_enabled=captions_enabled,
            music_enabled=music_enabled,
        )
        self.session.add(render)
        self.session.flush()
        return render

    def get(self, render_id: str, *, for_update: bool = False) -> Render | None:
        statement = (
            select(Render)
            .where(Render.id == render_id)
            .options(
                selectinload(Render.asset),
                selectinload(Render.job),
                selectinload(Render.project),
            )
        )
        if for_update:
            statement = statement.with_for_update()
        if self.user_id is not None:
            statement = statement.where(Render.user_id == self.user_id)
        return self.session.scalar(statement)

    def list_for_project(self, project_id: str) -> list[Render]:
        statement = (
            select(Render)
                .where(Render.project_id == project_id)
                .options(selectinload(Render.asset), selectinload(Render.job))
                .order_by(Render.version.desc())
        )
        if self.user_id is not None:
            statement = statement.where(Render.user_id == self.user_id)
        return list(self.session.scalars(statement))

    def next_version(self, project_id: str) -> int:
        statement = select(func.max(Render.version)).where(
            Render.project_id == project_id
        )
        if self.user_id is not None:
            statement = statement.where(Render.user_id == self.user_id)
        latest = self.session.scalar(statement)
        return (latest or 0) + 1

    def active_for_project(self, project_id: str) -> Render | None:
        statement = (
            select(Render)
            .where(
                Render.project_id == project_id,
                Render.status.in_(
                    (RenderStatus.QUEUED, RenderStatus.RENDERING)
                ),
            )
            .order_by(Render.created_at.desc())
        )
        if self.user_id is not None:
            statement = statement.where(Render.user_id == self.user_id)
        return self.session.scalar(statement)

    def commit(self) -> None:
        self.session.commit()
