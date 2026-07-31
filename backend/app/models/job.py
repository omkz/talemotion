from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.ids import new_resource_id, utc_now
from app.models.base import Base
from app.models.project import enum_values

if TYPE_CHECKING:
    from app.models.project import Project
    from app.models.scene import Scene
    from app.models.user import User


class JobType(StrEnum):
    STORYBOARD = "storyboard"
    SCENE_GENERATION = "scene_generation"
    SCENE_REGENERATION = "scene_regeneration"
    PROJECT_GENERATION = "project_generation"
    RENDER = "render"


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCEL_REQUESTED = "cancel_requested"
    CANCELLED = "cancelled"


class GenerationJob(Base):
    __tablename__ = "generation_jobs"
    __table_args__ = (
        CheckConstraint("progress BETWEEN 0 AND 100", name="progress_range"),
        Index("ix_generation_jobs_created_at", "created_at"),
        Index(
            "ix_generation_jobs_parent_scene_created_at",
            "parent_job_id",
            "scene_id",
            "created_at",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(64),
        primary_key=True,
        default=lambda: new_resource_id("job"),
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        index=True,
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        index=True,
    )
    scene_id: Mapped[str | None] = mapped_column(
        ForeignKey("scenes.id", ondelete="CASCADE"),
        index=True,
    )
    parent_job_id: Mapped[str | None] = mapped_column(
        ForeignKey("generation_jobs.id", ondelete="SET NULL"),
        index=True,
    )
    type: Mapped[JobType] = mapped_column(
        Enum(
            JobType,
            values_callable=enum_values,
            native_enum=False,
            length=32,
        )
    )
    status: Mapped[JobStatus] = mapped_column(
        Enum(
            JobStatus,
            values_callable=enum_values,
            native_enum=False,
            length=16,
        ),
        default=JobStatus.QUEUED,
        index=True,
    )
    progress: Mapped[int] = mapped_column(Integer, default=0)
    current_stage: Mapped[str | None] = mapped_column(String(100))
    error_code: Mapped[str | None] = mapped_column(String(100))
    error_message: Mapped[str | None] = mapped_column(Text)
    input_payload: Mapped[dict[str, object]] = mapped_column(
        JSONB, default=dict, server_default="{}"
    )
    idempotency_key: Mapped[str | None] = mapped_column(
        String(200),
        unique=True,
        index=True,
    )
    result_payload: Mapped[dict[str, object] | None] = mapped_column(JSONB)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    max_retries: Mapped[int] = mapped_column(Integer, default=2)
    cancel_requested_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    project: Mapped[Project] = relationship(back_populates="jobs")
    user: Mapped[User] = relationship(back_populates="jobs")
    scene: Mapped[Scene | None] = relationship(back_populates="jobs")
    parent: Mapped[GenerationJob | None] = relationship(
        remote_side=[id],
        back_populates="children",
    )
    children: Mapped[list[GenerationJob]] = relationship(back_populates="parent")
