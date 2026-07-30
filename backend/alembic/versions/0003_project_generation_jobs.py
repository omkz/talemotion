"""Index parent and child generation jobs for progress aggregation."""

from collections.abc import Sequence

from alembic import op

revision: str = "0003_project_generation_jobs"
down_revision: str | None = "0002_scene_media_jobs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_generation_jobs_parent_scene_created_at",
        "generation_jobs",
        ["parent_job_id", "scene_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_generation_jobs_parent_scene_created_at",
        table_name="generation_jobs",
    )
