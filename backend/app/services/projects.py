from base64 import urlsafe_b64decode, urlsafe_b64encode
from binascii import Error as Base64Error
from dataclasses import dataclass

from app.core.errors import ApiError
from app.core.ids import utc_now
from app.models.chapter import Chapter
from app.models.project import Project, ProjectStatus, VideoMode
from app.repositories.sqlalchemy import ProjectRepository
from app.schemas.project import (
    CreateProjectRequest,
    HistoricalDocumentaryBrief,
    UpdateProjectRequest,
)


@dataclass(frozen=True, slots=True)
class ProjectPage:
    items: list[Project]
    next_cursor: str | None
    has_more: bool


class ProjectService:
    def __init__(self, repository: ProjectRepository) -> None:
        self.repository = repository

    def create_project(self, request: CreateProjectRequest) -> Project:
        if request.brief.mode is not request.mode:
            raise ApiError(
                status_code=422,
                code="invalid_project_brief",
                message="Project mode must match brief mode.",
                details={
                    "mode": request.mode.value,
                    "brief_mode": request.brief.mode.value,
                },
            )
        if (
            request.mode is not VideoMode.HISTORICAL_DOCUMENTARY
            or not isinstance(request.brief, HistoricalDocumentaryBrief)
        ):
            raise ApiError(
                status_code=409,
                code="mode_not_available",
                message="Only Historical Documentary is available in the real backend.",
                details={"mode": request.mode.value, "availability": "coming_soon"},
            )
        output = request.output_config
        project = Project(
            mode=request.mode,
            status=ProjectStatus.DRAFT,
            title=output.title,
            topic=request.brief.topic,
            additional_direction=request.brief.additional_direction,
            source_notes=request.brief.source_notes,
            historical_accuracy_note=None,
            language=output.language,
            duration_seconds=output.duration_seconds,
            aspect_ratio=output.aspect_ratio,
            visual_style=output.visual_style,
            narration_style=output.narration_style,
            captions_enabled=output.captions_enabled,
            music_enabled=output.background_music_enabled,
            generation_progress=0,
        )
        project.chapters.append(Chapter(title="Main", position=1))
        created = self.repository.add(project)
        self.repository.commit()
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
        if request.brief is not None:
            if not isinstance(request.brief, HistoricalDocumentaryBrief):
                raise ApiError(
                    status_code=422,
                    code="mode_not_supported",
                    message="Only Historical Documentary is implemented.",
                    details={"availability": "coming_soon"},
                )
            project.topic = request.brief.topic
            project.additional_direction = request.brief.additional_direction
            project.source_notes = request.brief.source_notes
        if request.output_config is not None:
            output = request.output_config
            project.title = output.title
            project.language = output.language
            project.duration_seconds = output.duration_seconds
            project.aspect_ratio = output.aspect_ratio
            project.visual_style = output.visual_style
            project.narration_style = output.narration_style
            project.captions_enabled = output.captions_enabled
            project.music_enabled = output.background_music_enabled
        if request.title is not None:
            project.title = request.title
        if "historical_accuracy_note" in request.model_fields_set:
            project.historical_accuracy_note = request.historical_accuracy_note
        project.updated_at = utc_now()
        self.repository.commit()
        return self.get_project(project_id)

    def soft_delete_project(self, project_id: str) -> None:
        project = self.get_project(project_id)
        project.status = ProjectStatus.DELETED
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
