from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.ids import new_resource_id
from app.models.base import Base

if TYPE_CHECKING:
    from app.models.project import Project
    from app.models.scene import Scene


class Chapter(Base):
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
    position: Mapped[int] = mapped_column(Integer)

    project: Mapped[Project] = relationship(back_populates="chapters")
    scenes: Mapped[list[Scene]] = relationship(
        back_populates="chapter",
        cascade="all, delete-orphan",
        order_by="Scene.position",
        lazy="selectin",
    )
