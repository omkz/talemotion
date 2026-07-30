from app.core.errors import ApiError
from app.core.ids import utc_now
from app.models.chapter import Chapter
from app.models.project import ProjectStatus
from app.models.scene import Scene, SceneStatus
from app.repositories.sqlalchemy import ProjectRepository
from app.schemas.scene import CreateSceneRequest, UpdateSceneRequest


class SceneService:
    def __init__(self, repository: ProjectRepository) -> None:
        self.repository = repository

    def get_chapter(self, chapter_id: str) -> Chapter:
        chapter = self.repository.get_chapter(chapter_id)
        if chapter is None:
            raise ApiError(
                status_code=404,
                code="chapter_not_found",
                message="Chapter not found.",
                details={"chapter_id": chapter_id},
            )
        self._require_active_project(chapter.project.status, chapter.project_id)
        return chapter

    def add_scene(self, chapter_id: str, request: CreateSceneRequest) -> Scene:
        chapter = self.get_chapter(chapter_id)
        position = request.position or len(chapter.scenes) + 1
        if position > len(chapter.scenes) + 1:
            raise ApiError(
                status_code=422,
                code="validation_error",
                message="Scene position is outside the chapter.",
                details={"position": position},
            )
        scene = Scene(
            title=request.title,
            narration=request.narration,
            visual_prompt=request.visual_prompt,
            duration_seconds=request.duration_seconds,
            position=position,
            status=SceneStatus.DRAFT,
            active_asset_version=0,
        )
        chapter.scenes.insert(position - 1, scene)
        self._normalize(chapter.scenes)
        self.repository.commit()
        return self.get_scene(scene.id)

    def get_scene(self, scene_id: str) -> Scene:
        scene = self.repository.get_scene(scene_id)
        if scene is None:
            raise ApiError(
                status_code=404,
                code="scene_not_found",
                message="Scene not found.",
                details={"scene_id": scene_id},
            )
        self._require_active_project(
            scene.chapter.project.status,
            scene.chapter.project_id,
        )
        return scene

    def update_scene(self, scene_id: str, request: UpdateSceneRequest) -> Scene:
        scene = self.get_scene(scene_id)
        for field, value in request.model_dump(exclude_unset=True).items():
            if value is None:
                raise ApiError(
                    status_code=422,
                    code="validation_error",
                    message="Scene fields cannot be null.",
                    details={"field": field},
                )
            setattr(scene, field, value)
        scene.updated_at = utc_now()
        self.repository.commit()
        return self.get_scene(scene_id)

    def delete_scene(self, scene_id: str) -> None:
        scene = self.get_scene(scene_id)
        chapter = scene.chapter
        chapter.scenes.remove(scene)
        self._normalize(chapter.scenes)
        self.repository.commit()

    def duplicate_scene(self, scene_id: str) -> Scene:
        source = self.get_scene(scene_id)
        chapter = source.chapter
        duplicate = Scene(
            title=f"{source.title} Copy",
            narration=source.narration,
            visual_prompt=source.visual_prompt,
            duration_seconds=source.duration_seconds,
            position=source.position + 1,
            status=SceneStatus.DRAFT,
            active_asset_version=0,
        )
        chapter.scenes.insert(source.position, duplicate)
        self._normalize(chapter.scenes)
        self.repository.commit()
        return self.get_scene(duplicate.id)

    def reorder_scenes(
        self,
        chapter_id: str,
        scene_ids: list[str],
    ) -> Chapter:
        chapter = self.get_chapter(chapter_id)
        current = {scene.id: scene for scene in chapter.scenes}
        if len(scene_ids) != len(set(scene_ids)) or set(scene_ids) != set(current):
            raise ApiError(
                status_code=409,
                code="invalid_scene_order",
                message="Scene order must contain every chapter scene exactly once.",
                details={
                    "expected_scene_ids": ",".join(current),
                    "received_scene_ids": ",".join(scene_ids),
                },
            )
        chapter.scenes = [current[scene_id] for scene_id in scene_ids]
        self._normalize(chapter.scenes)
        self.repository.commit()
        return self.get_chapter(chapter_id)

    def _normalize(self, scenes: list[Scene]) -> None:
        now = utc_now()
        for temporary_position, scene in enumerate(scenes, start=1):
            scene.position = -temporary_position
            scene.updated_at = now
        self.repository.session.flush()
        for position, scene in enumerate(scenes, start=1):
            scene.position = position
            scene.updated_at = now

    @staticmethod
    def _require_active_project(status: ProjectStatus, project_id: str) -> None:
        if status is ProjectStatus.DELETED:
            raise ApiError(
                status_code=409,
                code="project_deleted",
                message="Project has been deleted.",
                details={"project_id": project_id},
            )
