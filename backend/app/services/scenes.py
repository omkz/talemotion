from datetime import datetime

from app.core.errors import ApiError
from app.core.ids import new_resource_id, utc_now
from app.models.chapter import Chapter
from app.models.project import Project, ProjectStatus
from app.models.scene import Scene, SceneStatus
from app.repositories.interfaces import ProjectRepository
from app.schemas.scene import CreateSceneRequest, UpdateSceneRequest


class SceneService:
    def __init__(self, repository: ProjectRepository) -> None:
        self._repository = repository

    def get_chapter(self, chapter_id: str) -> Chapter:
        project = self._repository.get_project_for_chapter(chapter_id)
        if project is None:
            raise ApiError(
                status_code=404,
                code="chapter_not_found",
                message="Chapter not found.",
                details={"chapter_id": chapter_id},
            )
        self._require_active_project(project)
        return self._find_chapter(project, chapter_id)

    def add_scene(
        self,
        chapter_id: str,
        request: CreateSceneRequest,
    ) -> Scene:
        project, chapter = self._get_project_and_chapter(chapter_id)
        insert_position = request.position or len(chapter.scenes) + 1
        if insert_position > len(chapter.scenes) + 1:
            raise ApiError(
                status_code=422,
                code="validation_error",
                message="Scene position is outside the chapter.",
                details={
                    "position": insert_position,
                    "maximum": len(chapter.scenes) + 1,
                },
            )
        now = utc_now()
        scene = Scene(
            id=new_resource_id("scene"),
            chapter_id=chapter.id,
            title=request.title,
            narration=request.narration,
            visual_prompt=request.visual_prompt,
            duration_seconds=request.duration_seconds,
            position=insert_position,
            status=SceneStatus.DRAFT,
            created_at=now,
            updated_at=now,
        )
        chapter.scenes.insert(insert_position - 1, scene)
        self._normalize_and_save(project, chapter, now)
        return self.get_scene(scene.id)

    def get_scene(self, scene_id: str) -> Scene:
        project = self._repository.get_project_for_scene(scene_id)
        if project is None:
            raise ApiError(
                status_code=404,
                code="scene_not_found",
                message="Scene not found.",
                details={"scene_id": scene_id},
            )
        self._require_active_project(project)
        return self._find_scene(project, scene_id)

    def update_scene(
        self,
        scene_id: str,
        request: UpdateSceneRequest,
    ) -> Scene:
        project, chapter, scene = self._get_project_chapter_and_scene(scene_id)
        updates = request.model_dump(exclude_unset=True)
        null_fields = [key for key, value in updates.items() if value is None]
        if null_fields:
            raise ApiError(
                status_code=422,
                code="validation_error",
                message="Request validation failed.",
                details={
                    "field": null_fields[0],
                    "reason": "Field cannot be null.",
                },
            )
        updated_scene = scene.model_copy(update=updates)
        updated_scene.updated_at = utc_now()
        chapter.scenes[scene.position - 1] = updated_scene
        self._normalize_and_save(project, chapter, updated_scene.updated_at)
        return self.get_scene(scene_id)

    def delete_scene(self, scene_id: str) -> None:
        project, chapter, scene = self._get_project_chapter_and_scene(scene_id)
        chapter.scenes = [item for item in chapter.scenes if item.id != scene.id]
        self._normalize_and_save(project, chapter, utc_now())

    def duplicate_scene(self, scene_id: str) -> Scene:
        project, chapter, scene = self._get_project_chapter_and_scene(scene_id)
        now = utc_now()
        duplicate = Scene(
            id=new_resource_id("scene"),
            chapter_id=chapter.id,
            title=f"{scene.title} Copy",
            narration=scene.narration,
            visual_prompt=scene.visual_prompt,
            duration_seconds=scene.duration_seconds,
            position=scene.position + 1,
            status=SceneStatus.DRAFT,
            created_at=now,
            updated_at=now,
        )
        chapter.scenes.insert(scene.position, duplicate)
        self._normalize_and_save(project, chapter, now)
        return self.get_scene(duplicate.id)

    def reorder_scenes(self, chapter_id: str, scene_ids: list[str]) -> Chapter:
        project, chapter = self._get_project_and_chapter(chapter_id)
        current_ids = [scene.id for scene in chapter.scenes]
        if (
            len(scene_ids) != len(set(scene_ids))
            or len(scene_ids) != len(current_ids)
            or set(scene_ids) != set(current_ids)
        ):
            raise ApiError(
                status_code=422,
                code="invalid_scene_order",
                message="Scene order must contain every chapter scene exactly once.",
                details={
                    "expected_scene_ids": current_ids,
                    "received_scene_ids": scene_ids,
                },
            )
        scene_by_id = {scene.id: scene for scene in chapter.scenes}
        chapter.scenes = [scene_by_id[scene_id] for scene_id in scene_ids]
        self._normalize_and_save(project, chapter, utc_now())
        return self.get_chapter(chapter_id)

    def _get_project_and_chapter(self, chapter_id: str) -> tuple[Project, Chapter]:
        project = self._repository.get_project_for_chapter(chapter_id)
        if project is None:
            raise ApiError(
                status_code=404,
                code="chapter_not_found",
                message="Chapter not found.",
                details={"chapter_id": chapter_id},
            )
        self._require_active_project(project)
        return project, self._find_chapter(project, chapter_id)

    def _get_project_chapter_and_scene(
        self,
        scene_id: str,
    ) -> tuple[Project, Chapter, Scene]:
        project = self._repository.get_project_for_scene(scene_id)
        if project is None:
            raise ApiError(
                status_code=404,
                code="scene_not_found",
                message="Scene not found.",
                details={"scene_id": scene_id},
            )
        self._require_active_project(project)
        for chapter in project.chapters:
            for scene in chapter.scenes:
                if scene.id == scene_id:
                    return project, chapter, scene
        raise RuntimeError("Repository returned an inconsistent project")

    def _normalize_and_save(
        self,
        project: Project,
        chapter: Chapter,
        timestamp: datetime,
    ) -> None:
        for position, scene in enumerate(chapter.scenes, start=1):
            scene.position = position
        chapter.updated_at = timestamp
        project.updated_at = timestamp
        self._repository.save_project(project)

    @staticmethod
    def _find_chapter(project: Project, chapter_id: str) -> Chapter:
        for chapter in project.chapters:
            if chapter.id == chapter_id:
                return chapter
        raise RuntimeError("Repository returned an inconsistent project")

    @staticmethod
    def _find_scene(project: Project, scene_id: str) -> Scene:
        for chapter in project.chapters:
            for scene in chapter.scenes:
                if scene.id == scene_id:
                    return scene
        raise RuntimeError("Repository returned an inconsistent project")

    @staticmethod
    def _require_active_project(project: Project) -> None:
        if project.status is ProjectStatus.DELETED:
            raise ApiError(
                status_code=409,
                code="project_deleted",
                message="Project has been deleted.",
                details={"project_id": project.id},
            )
