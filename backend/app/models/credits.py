from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.ids import new_resource_id, utc_now
from app.models.base import Base, TimestampMixin
from app.models.project import enum_values

if TYPE_CHECKING:
    from app.models.job import GenerationJob
    from app.models.project import Project
    from app.models.user import User


class CreditTransactionType(StrEnum):
    GRANT = "grant"
    RESERVATION = "reservation"
    CHARGE = "charge"
    RELEASE = "release"
    REFUND = "refund"
    ADJUSTMENT = "adjustment"


class UsageOperation(StrEnum):
    STORYBOARD_GENERATION = "storyboard_generation"
    IMAGE_GENERATION = "image_generation"
    VIDEO_GENERATION = "video_generation"
    TTS_GENERATION = "tts_generation"
    MUSIC_GENERATION = "music_generation"
    FINAL_RENDER = "final_render"


class CreditAccount(Base, TimestampMixin):
    __tablename__ = "credit_accounts"
    __table_args__ = (
        CheckConstraint("balance >= 0", name="credit_account_balance_nonnegative"),
        CheckConstraint(
            "reserved_balance >= 0",
            name="credit_account_reserved_nonnegative",
        ),
        CheckConstraint(
            "reserved_balance <= balance",
            name="credit_account_reserved_within_balance",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(64),
        primary_key=True,
        default=lambda: new_resource_id("credit"),
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )
    balance: Mapped[Decimal] = mapped_column(
        Numeric(18, 4),
        default=Decimal("0"),
    )
    reserved_balance: Mapped[Decimal] = mapped_column(
        Numeric(18, 4),
        default=Decimal("0"),
    )

    user: Mapped[User] = relationship(back_populates="credit_account")


class CreditTransaction(Base):
    __tablename__ = "credit_transactions"
    __table_args__ = (
        UniqueConstraint(
            "job_id",
            "type",
            name="credit_transaction_job_type",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(64),
        primary_key=True,
        default=lambda: new_resource_id("credit_txn"),
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    job_id: Mapped[str | None] = mapped_column(
        ForeignKey("generation_jobs.id", ondelete="SET NULL"),
        index=True,
    )
    type: Mapped[CreditTransactionType] = mapped_column(
        Enum(
            CreditTransactionType,
            values_callable=enum_values,
            native_enum=False,
            length=16,
        ),
        index=True,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    balance_after: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    description: Mapped[str] = mapped_column(Text)
    metadata_json: Mapped[dict[str, object]] = mapped_column(
        "metadata",
        JSONB,
        default=dict,
        server_default="{}",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )

    user: Mapped[User] = relationship(back_populates="credit_transactions")
    job: Mapped[GenerationJob | None] = relationship()


class UsageRecord(Base):
    __tablename__ = "usage_records"

    id: Mapped[str] = mapped_column(
        String(64),
        primary_key=True,
        default=lambda: new_resource_id("usage"),
    )
    idempotency_key: Mapped[str] = mapped_column(
        String(200),
        unique=True,
        index=True,
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        index=True,
    )
    job_id: Mapped[str] = mapped_column(
        ForeignKey("generation_jobs.id", ondelete="CASCADE"),
        index=True,
    )
    provider: Mapped[str] = mapped_column(String(100))
    model_name: Mapped[str] = mapped_column(String(150))
    operation: Mapped[UsageOperation] = mapped_column(
        Enum(
            UsageOperation,
            values_callable=enum_values,
            native_enum=False,
            length=32,
        ),
        index=True,
    )
    input_units: Mapped[Decimal] = mapped_column(
        Numeric(20, 6),
        default=Decimal("0"),
    )
    output_units: Mapped[Decimal] = mapped_column(
        Numeric(20, 6),
        default=Decimal("0"),
    )
    provider_cost_usd: Mapped[Decimal] = mapped_column(
        Numeric(18, 6),
        default=Decimal("0"),
    )
    credits_charged: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    metadata_json: Mapped[dict[str, object]] = mapped_column(
        "metadata",
        JSONB,
        default=dict,
        server_default="{}",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )

    user: Mapped[User] = relationship(back_populates="usage_records")
    project: Mapped[Project] = relationship()
    job: Mapped[GenerationJob] = relationship()
