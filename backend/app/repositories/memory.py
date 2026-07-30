from threading import RLock
from typing import cast

from fastapi import Request

from app.models.project import Project, ProjectStatus
from app.repositories.interfaces import ProjectRepository


class InMemoryProjectRepository:
    """Process-local project storage.

    All data is discarded whenever the API process restarts. Values cross the
    repository boundary as deep copies so callers must use ``save_project`` to
    persist mutations.
    """

    def __init__(self) -> None:
        self._projects: dict[str, Project] = {}
        self._lock = RLock()

    def create_project(self, project: Project) -> Project:
        with self._lock:
            if project.id in self._projects:
                raise ValueError(f"Duplicate project ID: {project.id}")
            self._projects[project.id] = project.model_copy(deep=True)
            return project.model_copy(deep=True)

    def list_projects(self, *, include_deleted: bool = False) -> list[Project]:
        with self._lock:
            projects = self._projects.values()
            return [
                project.model_copy(deep=True)
                for project in projects
                if include_deleted or project.status is not ProjectStatus.DELETED
            ]

    def get_project(self, project_id: str) -> Project | None:
        with self._lock:
            project = self._projects.get(project_id)
            return project.model_copy(deep=True) if project is not None else None

    def save_project(self, project: Project) -> Project:
        with self._lock:
            if project.id not in self._projects:
                raise KeyError(project.id)
            self._projects[project.id] = project.model_copy(deep=True)
            return project.model_copy(deep=True)

    def get_project_for_chapter(self, chapter_id: str) -> Project | None:
        with self._lock:
            for project in self._projects.values():
                if any(chapter.id == chapter_id for chapter in project.chapters):
                    return project.model_copy(deep=True)
        return None

    def get_project_for_scene(self, scene_id: str) -> Project | None:
        with self._lock:
            for project in self._projects.values():
                if any(
                    scene.id == scene_id
                    for chapter in project.chapters
                    for scene in chapter.scenes
                ):
                    return project.model_copy(deep=True)
        return None


def get_project_repository(request: Request) -> ProjectRepository:
    return cast(ProjectRepository, request.app.state.project_repository)
