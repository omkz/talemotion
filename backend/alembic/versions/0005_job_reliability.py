"""Add persisted job idempotency.

Revision ID: 0005_job_reliability
Revises: 0004_final_rendering
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0005_job_reliability"
down_revision: str | None = "0004_final_rendering"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "generation_jobs",
        sa.Column("idempotency_key", sa.String(length=200), nullable=True),
    )
    op.create_index(
        "ix_generation_jobs_idempotency_key",
        "generation_jobs",
        ["idempotency_key"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_generation_jobs_idempotency_key",
        table_name="generation_jobs",
    )
    op.drop_column("generation_jobs", "idempotency_key")
