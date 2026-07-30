from __future__ import annotations

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.asset import Asset, AssetStatus, AssetType
from app.models.chapter import Chapter
from app.models.job import GenerationJob, JobStatus, JobType
from app.models.project import Project, ProjectStatus, VideoMode
from app.models.render import Render
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

    def get_chapter(self, chapter_id: str) -> Chapter | None:
        return self.session.scalar(
            select(Chapter)
            .where(Chapter.id == chapter_id)
            .options(
                selectinload(Chapter.project),
                selectinload(Chapter.scenes).selectinload(Scene.assets),
                selectinload(Chapter.scenes).selectinload(Scene.jobs),
            )
        )

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

    def commit(self) -> None:
        self.session.commit()


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
    ) -> GenerationJob:
        job = GenerationJob(
            project_id=project_id,
            scene_id=scene_id,
            parent_job_id=parent_job_id,
            type=job_type,
            status=JobStatus.QUEUED,
            progress=0,
            current_stage=current_stage,
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

    def commit(self) -> None:
        self.session.commit()


class AssetRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, asset: Asset) -> Asset:
        self.session.add(asset)
        self.session.flush()
        return asset

    def get(self, asset_id: str) -> Asset | None:
        return self.session.scalar(
            select(Asset)
            .where(Asset.id == asset_id)
            .options(
                selectinload(Asset.project),
                selectinload(Asset.scene).selectinload(Scene.chapter),
            )
        )

    def list(
        self,
        *,
        project_id: str | None = None,
        scene_id: str | None = None,
        asset_type: AssetType | None = None,
        status: AssetStatus | None = None,
        search: str | None = None,
    ) -> list[Asset]:
        statement = (
            select(Asset)
            .options(
                selectinload(Asset.project),
                selectinload(Asset.scene).selectinload(Scene.chapter),
            )
            .order_by(Asset.created_at.desc(), Asset.id.desc())
        )
        if project_id:
            statement = statement.where(Asset.project_id == project_id)
        if scene_id:
            statement = statement.where(Asset.scene_id == scene_id)
        if asset_type:
            statement = statement.where(Asset.type == asset_type)
        if status:
            statement = statement.where(Asset.status == status)
        if search:
            term = f"%{search.strip()}%"
            statement = statement.join(Project).where(
                or_(Project.title.ilike(term), Asset.b2_object_key.ilike(term))
            )
        return list(self.session.scalars(statement).unique())

    def next_version(self, scene_id: str) -> int:
        latest = self.session.scalar(
            select(func.max(Asset.version)).where(Asset.scene_id == scene_id)
        )
        return int(latest or 0) + 1

    def get_scene_version(self, scene_id: str, version: int) -> Asset | None:
        return self.session.scalar(
            select(Asset).where(
                Asset.scene_id == scene_id,
                Asset.version == version,
            )
        )

    def active_scene_assets(self, project_id: str) -> list[Asset]:
        return list(
            self.session.scalars(
                select(Asset)
                .join(Scene, Asset.scene_id == Scene.id)
                .join(Chapter, Scene.chapter_id == Chapter.id)
                .where(
                    Asset.project_id == project_id,
                    Asset.status == AssetStatus.READY,
                    Asset.version == Scene.active_asset_version,
                    Asset.type.in_([AssetType.IMAGE, AssetType.VIDEO]),
                )
                .order_by(Chapter.position, Scene.position)
                .options(selectinload(Asset.scene))
            )
        )

    def commit(self) -> None:
        self.session.commit()


class RenderRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, render: Render) -> Render:
        self.session.add(render)
        self.session.flush()
        return render

    def get(self, render_id: str) -> Render | None:
        return self.session.get(Render, render_id)

    def list_for_project(self, project_id: str) -> list[Render]:
        return list(
            self.session.scalars(
                select(Render)
                .where(Render.project_id == project_id)
                .order_by(Render.version.desc())
            )
        )

    def next_version(self, project_id: str) -> int:
        latest = self.session.scalar(
            select(func.max(Render.version)).where(Render.project_id == project_id)
        )
        return int(latest or 0) + 1

    def commit(self) -> None:
        self.session.commit()
