"""Create the persisted backend foundation."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0001_backend_foundation"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("mode", sa.String(32), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("topic", sa.Text(), nullable=False),
        sa.Column("additional_direction", sa.Text(), nullable=False),
        sa.Column("historical_accuracy_note", sa.Text()),
        sa.Column("language", sa.String(32), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=False),
        sa.Column("aspect_ratio", sa.String(8), nullable=False),
        sa.Column("visual_style", sa.String(100), nullable=False),
        sa.Column("narration_style", sa.String(100), nullable=False),
        sa.Column("captions_enabled", sa.Boolean(), nullable=False),
        sa.Column("music_enabled", sa.Boolean(), nullable=False),
        sa.Column("generation_progress", sa.Integer(), nullable=False),
        *timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "duration_seconds IN (30, 45)", name="ck_projects_supported_duration"
        ),
        sa.CheckConstraint(
            "generation_progress BETWEEN 0 AND 100",
            name="ck_projects_generation_progress_range",
        ),
    )
    op.create_index("ix_projects_status", "projects", ["status"])

    op.create_table(
        "chapters",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(64),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("summary", sa.Text()),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("target_duration_seconds", sa.Integer()),
        sa.Column("status", sa.String(16), nullable=False),
        *timestamps(),
        sa.UniqueConstraint(
            "project_id", "position", name="chapter_position"
        ),
    )
    op.create_index("ix_chapters_project_id", "chapters", ["project_id"])
    op.create_index("ix_chapters_status", "chapters", ["status"])

    op.create_table(
        "scenes",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "chapter_id",
            sa.String(64),
            sa.ForeignKey("chapters.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("narration", sa.Text(), nullable=False),
        sa.Column("visual_prompt", sa.Text(), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("active_asset_id", sa.String(64)),
        sa.Column("active_asset_version", sa.Integer(), nullable=False),
        *timestamps(),
        sa.CheckConstraint(
            "duration_seconds > 0 AND duration_seconds <= 60",
            name="ck_scenes_duration_range",
        ),
        sa.UniqueConstraint("chapter_id", "position", name="scene_position"),
    )
    op.create_index("ix_scenes_chapter_id", "scenes", ["chapter_id"])
    op.create_index("ix_scenes_status", "scenes", ["status"])

    op.create_table(
        "generation_jobs",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(64),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "scene_id",
            sa.String(64),
            sa.ForeignKey("scenes.id", ondelete="CASCADE"),
        ),
        sa.Column(
            "parent_job_id",
            sa.String(64),
            sa.ForeignKey("generation_jobs.id", ondelete="SET NULL"),
        ),
        sa.Column("type", sa.String(32), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("current_stage", sa.String(100)),
        sa.Column("input_payload", postgresql.JSONB(), nullable=False),
        sa.Column("result_payload", postgresql.JSONB()),
        sa.Column("error_code", sa.String(100)),
        sa.Column("error_message", sa.Text()),
        sa.Column("retry_count", sa.Integer(), nullable=False),
        sa.Column("max_retries", sa.Integer(), nullable=False),
        sa.Column("cancel_requested_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "progress BETWEEN 0 AND 100",
            name="ck_generation_jobs_progress_range",
        ),
    )
    for column in ("project_id", "scene_id", "parent_job_id", "status", "created_at"):
        op.create_index(f"ix_generation_jobs_{column}", "generation_jobs", [column])

    op.create_table(
        "assets",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(64),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "scene_id",
            sa.String(64),
            sa.ForeignKey("scenes.id", ondelete="CASCADE"),
        ),
        sa.Column(
            "parent_asset_id",
            sa.String(64),
            sa.ForeignKey("assets.id", ondelete="SET NULL"),
        ),
        sa.Column("type", sa.String(24), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(100)),
        sa.Column("model_name", sa.String(150)),
        sa.Column("prompt", sa.Text()),
        sa.Column(
            "generation_parameters", postgresql.JSONB(), nullable=False
        ),
        sa.Column("storage_bucket", sa.String(255)),
        sa.Column("storage_object_key", sa.String(1024), unique=True),
        sa.Column("mime_type", sa.String(100)),
        sa.Column("file_size_bytes", sa.BigInteger()),
        sa.Column("sha256", sa.String(64)),
        sa.Column("provenance_object_key", sa.String(1024)),
        *timestamps(),
        sa.Column("archived_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint(
            "scene_id", "type", "version", name="asset_scene_type_version"
        ),
    )
    op.create_index("ix_assets_project_id", "assets", ["project_id"])
    op.create_index("ix_assets_scene_id", "assets", ["scene_id"])
    op.create_foreign_key(
        "fk_scenes_active_asset_id_assets",
        "scenes",
        "assets",
        ["active_asset_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "renders",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(64),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "job_id",
            sa.String(64),
            sa.ForeignKey("generation_jobs.id", ondelete="SET NULL"),
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column(
            "asset_id",
            sa.String(64),
            sa.ForeignKey("assets.id", ondelete="SET NULL"),
        ),
        sa.Column("duration_seconds", sa.Integer()),
        sa.Column("file_size_bytes", sa.BigInteger()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "project_id", "version", name="render_project_version"
        ),
    )
    op.create_index("ix_renders_project_id", "renders", ["project_id"])
    op.create_index("ix_renders_job_id", "renders", ["job_id"])


def downgrade() -> None:
    op.drop_table("renders")
    op.drop_constraint(
        "fk_scenes_active_asset_id_assets", "scenes", type_="foreignkey"
    )
    op.drop_table("assets")
    op.drop_table("generation_jobs")
    op.drop_table("scenes")
    op.drop_table("chapters")
    op.drop_table("projects")
