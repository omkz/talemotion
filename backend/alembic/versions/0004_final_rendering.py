"""Persist narration settings and final render options."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0004_final_rendering"
down_revision: str | None = "0003_project_generation_jobs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column(
            "narration_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    for column in (
        "narration_enabled",
        "captions_enabled",
        "music_enabled",
    ):
        op.add_column(
            "renders",
            sa.Column(
                column,
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            ),
        )
    op.create_index(
        "ix_assets_project_type_created_at",
        "assets",
        ["project_id", "type", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_assets_project_type_created_at", table_name="assets")
    for column in (
        "music_enabled",
        "captions_enabled",
        "narration_enabled",
    ):
        op.drop_column("renders", column)
    op.drop_column("projects", "narration_enabled")
