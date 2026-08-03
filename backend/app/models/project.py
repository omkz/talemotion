from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.ids import new_resource_id
from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.asset import Asset
    from app.models.chapter import Chapter
    from app.models.job import GenerationJob
    from app.models.render import Render
    from app.models.user import User


def enum_values(enum_type: type[StrEnum]) -> list[str]:
    return [value.value for value in enum_type]


class VideoMode(StrEnum):
    HISTORICAL_DOCUMENTARY = "historical_documentary"
    MICRODRAMA = "microdrama"
    PRODUCT_ADVERTISEMENT = "product_advertisement"


class ProjectStatus(StrEnum):
    DRAFT = "draft"
    STORYBOARD_PENDING = "storyboard_pending"
    STORYBOARD_GENERATING = "storyboard_generating"
    STORYBOARD_READY = "storyboard_ready"
    MEDIA_GENERATING = "media_generating"
    RENDERING = "rendering"
    READY = "ready"
    FAILED = "failed"
    DELETED = "deleted"


class AspectRatio(StrEnum):
    VERTICAL = "9:16"


class ContentType(StrEnum):
    DOCUMENTARY = "documentary"
    EDUCATIONAL = "educational"
    FICTION = "fiction"
    EXPLAINER = "explainer"
    PROMOTIONAL = "promotional"


class ProjectTone(StrEnum):
    CINEMATIC = "cinematic"
    INFORMATIVE = "informative"
    DRAMATIC = "dramatic"
    INSPIRATIONAL = "inspirational"
    NEUTRAL = "neutral"


class Project(Base, TimestampMixin):
    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint(
            "duration_seconds IN (30, 45)",
            name="supported_duration",
        ),
        CheckConstraint(
            "generation_progress BETWEEN 0 AND 100",
            name="generation_progress_range",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(64),
        primary_key=True,
        default=lambda: new_resource_id("project"),
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        index=True,
    )
    mode: Mapped[VideoMode] = mapped_column(
        Enum(
            VideoMode,
            values_callable=enum_values,
            native_enum=False,
            length=32,
        )
    )
    status: Mapped[ProjectStatus] = mapped_column(
        Enum(
            ProjectStatus,
            values_callable=enum_values,
            native_enum=False,
            length=32,
        ),
        default=ProjectStatus.DRAFT,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200))
    topic: Mapped[str] = mapped_column(Text)
    source_notes: Mapped[str | None] = mapped_column(Text)
    content_type: Mapped[ContentType] = mapped_column(
        Enum(
            ContentType,
            values_callable=enum_values,
            native_enum=False,
            length=32,
        ),
        default=ContentType.DOCUMENTARY,
    )
    tone: Mapped[ProjectTone] = mapped_column(
        Enum(
            ProjectTone,
            values_callable=enum_values,
            native_enum=False,
            length=32,
        ),
        default=ProjectTone.CINEMATIC,
    )
    target_audience: Mapped[str] = mapped_column(
        String(200), default="General audience"
    )
    additional_direction: Mapped[str] = mapped_column(Text, default="")
    historical_accuracy_note: Mapped[str | None] = mapped_column(Text)
    language: Mapped[str] = mapped_column(String(32), default="en")
    duration_seconds: Mapped[int] = mapped_column(Integer)
    aspect_ratio: Mapped[AspectRatio] = mapped_column(
        Enum(
            AspectRatio,
            values_callable=enum_values,
            native_enum=False,
            length=8,
        ),
        default=AspectRatio.VERTICAL,
    )
    visual_style: Mapped[str] = mapped_column(
        String(100),
        default="Cinematic Realistic",
    )
    narration_style: Mapped[str] = mapped_column(
        String(100),
        default="Documentary",
    )
    captions_enabled: Mapped[bool] = mapped_column(default=False)
    narration_enabled: Mapped[bool] = mapped_column(default=True)
    music_enabled: Mapped[bool] = mapped_column(default=False)
    generation_progress: Mapped[int] = mapped_column(Integer, default=0)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    chapters: Mapped[list[Chapter]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="Chapter.position",
        lazy="selectin",
    )
    jobs: Mapped[list[GenerationJob]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
    )
    assets: Mapped[list[Asset]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
    )
    renders: Mapped[list[Render]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
    )
    user: Mapped[User] = relationship(back_populates="projects")
