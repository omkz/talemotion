from __future__ import annotations

from sqlalchemy import Select, or_, select
from sqlalchemy.orm import Session, selectinload

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
