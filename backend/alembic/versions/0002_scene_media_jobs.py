"""Add an index for persisted scene media versions."""

from collections.abc import Sequence

from alembic import op

revision: str = "0002_scene_media_jobs"
down_revision: str | None = "0001_backend_foundation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_assets_scene_type_created_at",
        "assets",
        ["scene_id", "type", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_assets_scene_type_created_at", table_name="assets")
