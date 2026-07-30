from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.ids import new_resource_id
from app.models.base import Base, TimestampMixin
from app.models.project import enum_values

if TYPE_CHECKING:
    from app.models.asset import Asset
    from app.models.chapter import Chapter
    from app.models.job import GenerationJob


class SceneStatus(StrEnum):
    DRAFT = "draft"
    QUEUED = "queued"
    GENERATING_IMAGE = "generating_image"
    GENERATING_VIDEO = "generating_video"
    GENERATING_NARRATION = "generating_narration"
    UPLOADING_ASSETS = "uploading_assets"
    COMPLETED = "completed"
    FAILED = "failed"


class Scene(Base, TimestampMixin):
    __tablename__ = "scenes"
    __table_args__ = (
        CheckConstraint(
            "duration_seconds > 0 AND duration_seconds <= 60",
            name="duration_range",
        ),
        UniqueConstraint("chapter_id", "position", name="scene_position"),
    )

    id: Mapped[str] = mapped_column(
        String(64),
        primary_key=True,
        default=lambda: new_resource_id("scene"),
    )
    chapter_id: Mapped[str] = mapped_column(
        ForeignKey("chapters.id", ondelete="CASCADE"),
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200))
    narration: Mapped[str] = mapped_column(Text)
    visual_prompt: Mapped[str] = mapped_column(Text)
    duration_seconds: Mapped[int] = mapped_column(Integer)
    position: Mapped[int] = mapped_column(Integer)
    status: Mapped[SceneStatus] = mapped_column(
        Enum(
            SceneStatus,
            values_callable=enum_values,
            native_enum=False,
            length=32,
        ),
        default=SceneStatus.DRAFT,
        index=True,
    )
    active_asset_version: Mapped[int] = mapped_column(Integer, default=0)

    chapter: Mapped[Chapter] = relationship(back_populates="scenes")
    jobs: Mapped[list[GenerationJob]] = relationship(back_populates="scene")
    assets: Mapped[list[Asset]] = relationship(
        back_populates="scene",
        order_by="Asset.version",
    )
