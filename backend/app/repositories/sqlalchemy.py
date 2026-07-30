from __future__ import annotations

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.asset import Asset, AssetStatus, AssetType
from app.models.chapter import Chapter
from app.models.job import GenerationJob, JobStatus, JobType
from app.models.project import Project, ProjectStatus, VideoMode
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
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, project: Project) -> Project:
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
        return self.session.scalar(statement)

    def get_for_update(self, project_id: str) -> Project | None:
        return self.session.scalar(
            select(Project)
            .where(
                Project.id == project_id,
                Project.status != ProjectStatus.DELETED,
            )
            .options(*_project_graph())
            .with_for_update()
        )

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
        return self.session.scalar(statement)

    def get_scene(self, scene_id: str) -> Scene | None:
        return self.session.scalar(
            select(Scene)
            .where(Scene.id == scene_id)
            .options(
                selectinload(Scene.chapter).selectinload(Chapter.project),
                selectinload(Scene.assets),
                selectinload(Scene.jobs),
            )
        )

    def delete_chapter_scenes(self, chapter: Chapter) -> None:
        chapter.scenes.clear()
        self.session.flush()

    def commit(self) -> None:
        self.session.commit()

    def rollback(self) -> None:
        self.session.rollback()


class JobRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

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
    ) -> GenerationJob:
        job = GenerationJob(
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
        )
        self.session.add(job)
        self.session.flush()
        return job

    def get(self, job_id: str) -> GenerationJob | None:
        return self.session.scalar(
            select(GenerationJob)
            .where(GenerationJob.id == job_id)
            .options(
                selectinload(GenerationJob.children),
                selectinload(GenerationJob.scene).selectinload(Scene.chapter),
            )
        )

    def get_for_update(self, job_id: str) -> GenerationJob | None:
        return self.session.scalar(
            select(GenerationJob)
            .where(GenerationJob.id == job_id)
            .with_for_update()
        )

    def active_for_scene(self, scene_id: str) -> GenerationJob | None:
        return self.session.scalar(
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

    def active_for_project(
        self,
        project_id: str,
        job_type: JobType,
    ) -> GenerationJob | None:
        return self.session.scalar(
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

    def children(self, parent_job_id: str) -> list[GenerationJob]:
        return list(
            self.session.scalars(
                select(GenerationJob)
                .where(GenerationJob.parent_job_id == parent_job_id)
                .order_by(
                    GenerationJob.created_at.asc(),
                    GenerationJob.id.asc(),
                )
            )
        )

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
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, asset_id: str) -> Asset | None:
        return self.session.get(Asset, asset_id)

    def next_version(self, scene_id: str, asset_type: AssetType) -> int:
        latest = self.session.scalar(
            select(func.max(Asset.version)).where(
                Asset.scene_id == scene_id,
                Asset.type == asset_type,
            )
        )
        return (latest or 0) + 1

    def create(
        self,
        *,
        project_id: str,
        scene_id: str,
        asset_type: AssetType,
        version: int,
        provider: str,
        model_name: str,
        prompt: str,
        generation_parameters: dict[str, object],
        storage_bucket: str,
        storage_object_key: str,
        mime_type: str,
        file_size_bytes: int | None,
        sha256: str,
        provenance_object_key: str,
    ) -> Asset:
        asset = Asset(
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
        )
        self.session.add(asset)
        self.session.flush()
        return asset

    def commit(self) -> None:
        self.session.commit()
