from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.ids import new_resource_id, utc_now
from app.models.base import Base
from app.models.project import enum_values

if TYPE_CHECKING:
    from app.models.project import Project
    from app.models.scene import Scene


class AssetType(StrEnum):
    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"
    SUBTITLE = "subtitle"
    MANIFEST = "manifest"
    THUMBNAIL = "thumbnail"
    FINAL_VIDEO = "final_video"


class AssetStatus(StrEnum):
    PENDING = "pending"
    AVAILABLE = "available"
    FAILED = "failed"
    ARCHIVED = "archived"


class Asset(Base):
    __tablename__ = "assets"
    __table_args__ = (
        UniqueConstraint(
            "scene_id", "type", "version", name="asset_scene_type_version"
        ),
        Index("ix_assets_scene_type_created_at", "scene_id", "type", "created_at"),
        Index(
            "ix_assets_project_type_created_at",
            "project_id",
            "type",
            "created_at",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(64),
        primary_key=True,
        default=lambda: new_resource_id("asset"),
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        index=True,
    )
    scene_id: Mapped[str | None] = mapped_column(
        ForeignKey("scenes.id", ondelete="CASCADE"),
        index=True,
    )
    parent_asset_id: Mapped[str | None] = mapped_column(
        ForeignKey("assets.id", ondelete="SET NULL")
    )
    type: Mapped[AssetType] = mapped_column(
        Enum(
            AssetType,
            values_callable=enum_values,
            native_enum=False,
            length=24,
        )
    )
    version: Mapped[int] = mapped_column(Integer)
    status: Mapped[AssetStatus] = mapped_column(
        Enum(
            AssetStatus,
            values_callable=enum_values,
            native_enum=False,
            length=16,
        ),
        default=AssetStatus.PENDING,
    )
    provider: Mapped[str | None] = mapped_column(String(100))
    model_name: Mapped[str | None] = mapped_column(String(150))
    prompt: Mapped[str | None] = mapped_column(Text)
    generation_parameters: Mapped[dict[str, object]] = mapped_column(
        JSONB, default=dict, server_default="{}"
    )
    storage_bucket: Mapped[str | None] = mapped_column(String(255))
    storage_object_key: Mapped[str | None] = mapped_column(
        String(1024), unique=True
    )
    mime_type: Mapped[str | None] = mapped_column(String(100))
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    sha256: Mapped[str | None] = mapped_column(String(64))
    provenance_object_key: Mapped[str | None] = mapped_column(String(1024))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    project: Mapped[Project] = relationship(back_populates="assets")
    scene: Mapped[Scene | None] = relationship(
        back_populates="assets", foreign_keys=[scene_id]
    )
    parent_asset: Mapped[Asset | None] = relationship(remote_side=[id])
