from base64 import urlsafe_b64decode, urlsafe_b64encode
from binascii import Error as Base64Error
from dataclasses import dataclass

from app.core.errors import ApiError
from app.core.ids import utc_now
from app.models.chapter import Chapter, ChapterStatus
from app.models.project import (
    ContentType,
    Project,
    ProjectStatus,
    ProjectTone,
    VideoMode,
)
from app.repositories.sqlalchemy import ProjectRepository
from app.schemas.project import (
    CreateProjectRequest,
    UpdateProjectRequest,
    validate_historical_content_type,
)
from app.services.project_titles import derive_project_title, normalize_single_line


@dataclass(frozen=True, slots=True)
class ProjectPage:
    items: list[Project]
    next_cursor: str | None
    has_more: bool


class ProjectService:
    def __init__(self, repository: ProjectRepository) -> None:
        self.repository = repository

    def create_project(self, request: CreateProjectRequest) -> Project:
        if request.mode not in {
            VideoMode.HISTORICAL_DOCUMENTARY,
            VideoMode.CUSTOM_VIDEO,
        }:
            raise ApiError(
                status_code=409,
                code="not_implemented",
                message="This project mode is not available yet.",
                details={"mode": request.mode.value, "availability": "coming_soon"},
            )
        if request.duration_seconds not in (30, 45):
            raise ApiError(
                status_code=422,
                code="validation_error",
                message="Projects support 30 or 45 seconds.",
                details={"duration_seconds": request.duration_seconds},
            )
        project = Project(
            mode=request.mode,
            status=ProjectStatus.DRAFT,
            title=(
                normalize_single_line(request.title)
                if request.title
                else derive_project_title(request.topic)
            ),
            topic=request.topic,
            source_notes=request.source_notes,
            content_type=(
                request.content_type
                if request.mode is VideoMode.HISTORICAL_DOCUMENTARY
                else ContentType.DOCUMENTARY
            ),
            tone=(
                request.tone
                if request.mode is VideoMode.HISTORICAL_DOCUMENTARY
                else ProjectTone.CINEMATIC
            ),
            target_audience=request.target_audience,
            additional_direction=(
                request.additional_direction
                if request.mode is VideoMode.HISTORICAL_DOCUMENTARY
                else ""
            ),
            historical_accuracy_note=(
                request.historical_accuracy_note
                if request.mode is VideoMode.HISTORICAL_DOCUMENTARY
                else None
            ),
            language=request.language,
            duration_seconds=request.duration_seconds,
            aspect_ratio=request.aspect_ratio,
            visual_style=request.visual_style,
            narration_style=request.narration_style,
            captions_enabled=request.captions_enabled,
            narration_enabled=request.narration_enabled,
            music_enabled=request.music_enabled,
            generation_progress=0,
        )
        project.chapters.append(
            Chapter(
                title="Main",
                position=1,
                status=ChapterStatus.DRAFT,
                target_duration_seconds=request.duration_seconds,
            )
        )
        try:
            created = self.repository.add(project)
            self.repository.commit()
        except Exception:
            self.repository.rollback()
            raise
        return self.get_project(created.id)

    def list_projects(
        self,
        *,
        status: ProjectStatus | None,
        mode: VideoMode | None,
        search: str | None,
        limit: int,
        cursor: str | None,
    ) -> ProjectPage:
        projects = self.repository.list(status=status, mode=mode, search=search)
        offset = self._decode_cursor(cursor)
        if offset > len(projects):
            raise ApiError(
                status_code=400,
                code="validation_error",
                message="The pagination cursor is no longer valid.",
                details={"cursor": cursor or ""},
            )
        page_items = projects[offset : offset + limit]
        next_offset = offset + len(page_items)
        has_more = next_offset < len(projects)
        return ProjectPage(
            items=page_items,
            next_cursor=self._encode_cursor(next_offset) if has_more else None,
            has_more=has_more,
        )

    def get_project(self, project_id: str) -> Project:
        project = self.repository.get(project_id, include_deleted=True)
        if project is None:
            raise ApiError(
                status_code=404,
                code="project_not_found",
                message="Project not found.",
                details={"project_id": project_id},
            )
        if project.status is ProjectStatus.DELETED:
            raise ApiError(
                status_code=404,
                code="project_not_found",
                message="Project not found.",
                details={"project_id": project_id},
            )
        return project

    def update_project(
        self,
        project_id: str,
        request: UpdateProjectRequest,
    ) -> Project:
        project = self.get_project(project_id)
        values = request.model_dump(exclude_unset=True)
        if values.get("duration_seconds") not in (None, 30, 45):
            raise ApiError(
                status_code=422,
                code="validation_error",
                message="Projects support 30 or 45 seconds.",
                details={"duration_seconds": values["duration_seconds"]},
            )
        if "title" in values:
            values["title"] = normalize_single_line(values["title"])
        if "content_type" in values:
            if project.mode is VideoMode.HISTORICAL_DOCUMENTARY:
                validate_historical_content_type(values["content_type"])
            elif values["content_type"] is not project.content_type:
                raise ApiError(
                    status_code=422,
                    code="validation_error",
                    message="Custom Video does not expose a story approach.",
                    details={"field": "content_type"},
                )
        if project.mode is VideoMode.CUSTOM_VIDEO:
            values.pop("historical_accuracy_note", None)
            values.pop("additional_direction", None)
            values.pop("tone", None)
        for field, value in values.items():
            setattr(project, field, value)
        project.updated_at = utc_now()
        self.repository.commit()
        return self.get_project(project_id)

    def soft_delete_project(self, project_id: str) -> None:
        project = self.get_project(project_id)
        project.status = ProjectStatus.DELETED
        project.deleted_at = utc_now()
        project.updated_at = utc_now()
        self.repository.commit()

    @staticmethod
    def _encode_cursor(offset: int) -> str:
        return urlsafe_b64encode(f"projects:{offset}".encode()).decode().rstrip("=")

    @staticmethod
    def _decode_cursor(cursor: str | None) -> int:
        if cursor is None:
            return 0
        try:
            padded = cursor + "=" * (-len(cursor) % 4)
            namespace, raw_offset = urlsafe_b64decode(padded).decode().split(":", 1)
            offset = int(raw_offset)
            if namespace != "projects" or offset < 0:
                raise ValueError
            return offset
        except (Base64Error, UnicodeDecodeError, ValueError):
            raise ApiError(
                status_code=400,
                code="validation_error",
                message="The pagination cursor is invalid.",
                details={"cursor": cursor},
            ) from None
