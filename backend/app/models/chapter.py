from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.ids import new_resource_id
from app.models.base import Base, TimestampMixin
from app.models.project import enum_values

if TYPE_CHECKING:
    from app.models.project import Project
    from app.models.scene import Scene


class ChapterStatus(StrEnum):
    DRAFT = "draft"
    READY = "ready"
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"


class Chapter(Base, TimestampMixin):
    __tablename__ = "chapters"
    __table_args__ = (
        UniqueConstraint("project_id", "position", name="chapter_position"),
    )

    id: Mapped[str] = mapped_column(
        String(64),
        primary_key=True,
        default=lambda: new_resource_id("chapter"),
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str | None] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer)
    target_duration_seconds: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[ChapterStatus] = mapped_column(
        Enum(
            ChapterStatus,
            values_callable=enum_values,
            native_enum=False,
            length=16,
        ),
        default=ChapterStatus.DRAFT,
        index=True,
    )

    project: Mapped[Project] = relationship(back_populates="chapters")
    scenes: Mapped[list[Scene]] = relationship(
        back_populates="chapter",
        cascade="all, delete-orphan",
        order_by="Scene.position",
        lazy="selectin",
    )
