from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.ids import new_resource_id, utc_now
from app.models.base import Base
from app.models.project import enum_values

if TYPE_CHECKING:
    from app.models.asset import Asset
    from app.models.job import GenerationJob
    from app.models.project import Project


class RenderStatus(StrEnum):
    QUEUED = "queued"
    RENDERING = "rendering"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Render(Base):
    __tablename__ = "renders"
    __table_args__ = (
        UniqueConstraint("project_id", "version", name="render_project_version"),
    )

    id: Mapped[str] = mapped_column(
        String(64),
        primary_key=True,
        default=lambda: new_resource_id("render"),
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        index=True,
    )
    job_id: Mapped[str | None] = mapped_column(
        ForeignKey("generation_jobs.id", ondelete="SET NULL"), index=True
    )
    version: Mapped[int] = mapped_column(Integer)
    status: Mapped[RenderStatus] = mapped_column(
        Enum(
            RenderStatus,
            values_callable=enum_values,
            native_enum=False,
            length=16,
        ),
        default=RenderStatus.QUEUED,
    )
    asset_id: Mapped[str | None] = mapped_column(
        ForeignKey("assets.id", ondelete="SET NULL")
    )
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    narration_enabled: Mapped[bool] = mapped_column(default=True)
    captions_enabled: Mapped[bool] = mapped_column(default=True)
    music_enabled: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    project: Mapped[Project] = relationship(back_populates="renders")
    job: Mapped[GenerationJob | None] = relationship()
    asset: Mapped[Asset | None] = relationship()
