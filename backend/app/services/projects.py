from base64 import urlsafe_b64decode, urlsafe_b64encode
from binascii import Error as Base64Error
from dataclasses import dataclass

from app.core.errors import ApiError
from app.core.ids import new_resource_id, utc_now
from app.models.chapter import Chapter, ChapterStatus
from app.models.project import (
    HistoricalDocumentaryBrief,
    MicrodramaBrief,
    OutputConfiguration,
    ProductAdvertisementBrief,
    Project,
    ProjectBrief,
    ProjectStatus,
    VideoMode,
)
from app.repositories.interfaces import ProjectRepository
from app.schemas.project import (
    CreateProjectRequest,
    HistoricalDocumentaryBriefSchema,
    MicrodramaBriefSchema,
    ProductAdvertisementBriefSchema,
    UpdateProjectRequest,
)


@dataclass(frozen=True, slots=True)
class ProjectPage:
    items: list[Project]
    next_cursor: str | None
    has_more: bool


class ProjectService:
    def __init__(self, repository: ProjectRepository) -> None:
        self._repository = repository

    def create_project(self, request: CreateProjectRequest) -> Project:
        brief = self._brief_to_domain(request.brief)
        self._validate_brief_mode(request.mode, brief.mode)
        now = utc_now()
        project_id = new_resource_id("project")
        chapter = Chapter(
            id=new_resource_id("chapter"),
            project_id=project_id,
            title="Main",
            summary=None,
            position=1,
            target_duration_seconds=request.output.duration,
            status=ChapterStatus.DRAFT,
            scenes=[],
            created_at=now,
            updated_at=now,
        )
        project = Project(
            id=project_id,
            mode=request.mode,
            status=ProjectStatus.DRAFT,
            brief=brief,
            output=OutputConfiguration.model_validate(request.output.model_dump()),
            chapters=[chapter],
            template_id=request.template_id,
            thumbnail_url=None,
            historical_accuracy_note=request.historical_accuracy_note,
            generation_progress=0,
            created_at=now,
            updated_at=now,
            deleted_at=None,
        )
        return self._repository.create_project(project)

    def list_projects(
        self,
        *,
        status: ProjectStatus | None,
        mode: VideoMode | None,
        search: str | None,
        limit: int,
        cursor: str | None,
    ) -> ProjectPage:
        projects = self._repository.list_projects(
            include_deleted=status is ProjectStatus.DELETED
        )
        if status is not None:
            projects = [project for project in projects if project.status is status]
        if mode is not None:
            projects = [project for project in projects if project.mode is mode]
        if search:
            needle = search.strip().casefold()
            projects = [
                project
                for project in projects
                if needle in self._search_text(project).casefold()
            ]
        projects.sort(key=lambda project: project.created_at, reverse=True)

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
        project = self._repository.get_project(project_id)
        return self._require_active_project(project, project_id)

    def update_project(
        self,
        project_id: str,
        request: UpdateProjectRequest,
    ) -> Project:
        project = self.get_project(project_id)
        if "brief" in request.model_fields_set:
            if request.brief is None:
                raise self._null_field_error("brief")
            brief = self._brief_to_domain(request.brief)
            self._validate_brief_mode(project.mode, brief.mode)
            project.brief = brief

        if "output" in request.model_fields_set:
            if request.output is None:
                raise self._null_field_error("output")
            updates = request.output.model_dump(exclude_unset=True)
            null_fields = [key for key, value in updates.items() if value is None]
            if null_fields:
                raise self._null_field_error(f"output.{null_fields[0]}")
            project.output = project.output.model_copy(update=updates)
            project.chapters[0].target_duration_seconds = project.output.duration
            project.chapters[0].updated_at = utc_now()

        if "historical_accuracy_note" in request.model_fields_set:
            project.historical_accuracy_note = request.historical_accuracy_note

        project.updated_at = utc_now()
        return self._repository.save_project(project)

    def soft_delete_project(self, project_id: str) -> None:
        project = self.get_project(project_id)
        now = utc_now()
        project.status = ProjectStatus.DELETED
        project.deleted_at = now
        project.updated_at = now
        self._repository.save_project(project)

    @staticmethod
    def _brief_to_domain(
        brief: (
            HistoricalDocumentaryBriefSchema
            | MicrodramaBriefSchema
            | ProductAdvertisementBriefSchema
        ),
    ) -> ProjectBrief:
        if isinstance(brief, HistoricalDocumentaryBriefSchema):
            return HistoricalDocumentaryBrief.model_validate(brief.model_dump())
        if isinstance(brief, MicrodramaBriefSchema):
            return MicrodramaBrief.model_validate(brief.model_dump())
        return ProductAdvertisementBrief.model_validate(brief.model_dump())

    @staticmethod
    def _validate_brief_mode(mode: VideoMode, brief_mode: VideoMode) -> None:
        if mode is not brief_mode:
            raise ApiError(
                status_code=422,
                code="invalid_project_brief",
                message="Project mode must match brief mode.",
                details={"mode": mode.value, "brief_mode": brief_mode.value},
            )

    @staticmethod
    def _require_active_project(
        project: Project | None,
        project_id: str,
    ) -> Project:
        if project is None:
            raise ApiError(
                status_code=404,
                code="project_not_found",
                message="Project not found.",
                details={"project_id": project_id},
            )
        if project.status is ProjectStatus.DELETED:
            raise ApiError(
                status_code=409,
                code="project_deleted",
                message="Project has been deleted.",
                details={"project_id": project_id},
            )
        return project

    @staticmethod
    def _search_text(project: Project) -> str:
        brief = project.brief
        if isinstance(brief, HistoricalDocumentaryBrief):
            subject = brief.topic
        elif isinstance(brief, MicrodramaBrief):
            subject = brief.premise
        else:
            subject = brief.product_name
        return f"{project.output.title} {subject}"

    @staticmethod
    def _encode_cursor(offset: int) -> str:
        raw_cursor = f"projects:{offset}".encode()
        return urlsafe_b64encode(raw_cursor).decode().rstrip("=")

    @staticmethod
    def _decode_cursor(cursor: str | None) -> int:
        if cursor is None:
            return 0
        try:
            padded = cursor + "=" * (-len(cursor) % 4)
            decoded = urlsafe_b64decode(padded).decode()
            namespace, raw_offset = decoded.split(":", maxsplit=1)
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

    @staticmethod
    def _null_field_error(field_name: str) -> ApiError:
        return ApiError(
            status_code=422,
            code="validation_error",
            message="Request validation failed.",
            details={"field": field_name, "reason": "Field cannot be null."},
        )
