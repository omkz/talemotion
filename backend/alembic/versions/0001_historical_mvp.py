"""Create the historical documentary MVP schema."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0001_historical_mvp"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("mode", sa.String(32), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("topic", sa.Text(), nullable=False),
        sa.Column("additional_direction", sa.Text(), nullable=False),
        sa.Column("source_notes", sa.Text(), nullable=False),
        sa.Column("historical_accuracy_note", sa.Text()),
        sa.Column("language", sa.String(32), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=False),
        sa.Column("aspect_ratio", sa.String(8), nullable=False),
        sa.Column("visual_style", sa.String(100), nullable=False),
        sa.Column("narration_style", sa.String(100), nullable=False),
        sa.Column("captions_enabled", sa.Boolean(), nullable=False),
        sa.Column("music_enabled", sa.Boolean(), nullable=False),
        sa.Column("generation_progress", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "duration_seconds IN (30, 45)",
            name="ck_projects_supported_duration",
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
        sa.Column("position", sa.Integer(), nullable=False),
        sa.UniqueConstraint(
            "project_id",
            "position",
            name="chapter_position",
        ),
    )
    op.create_index("ix_chapters_project_id", "chapters", ["project_id"])

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
        sa.Column("active_asset_version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "duration_seconds > 0 AND duration_seconds <= 60",
            name="ck_scenes_duration_range",
        ),
        sa.UniqueConstraint(
            "chapter_id",
            "position",
            name="scene_position",
        ),
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
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("current_stage", sa.String(100)),
        sa.Column("error_code", sa.String(100)),
        sa.Column("error_message", sa.Text()),
        sa.Column("input_data", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
    )
    op.create_index(
        "ix_generation_jobs_project_id",
        "generation_jobs",
        ["project_id"],
    )
    op.create_index(
        "ix_generation_jobs_scene_id",
        "generation_jobs",
        ["scene_id"],
    )
    op.create_index(
        "ix_generation_jobs_parent_job_id",
        "generation_jobs",
        ["parent_job_id"],
    )
    op.create_index("ix_generation_jobs_status", "generation_jobs", ["status"])

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
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("provider", sa.String(100), nullable=False),
        sa.Column("model", sa.String(150), nullable=False),
        sa.Column("prompt", sa.Text()),
        sa.Column("generation_instruction", sa.Text()),
        sa.Column("b2_bucket", sa.String(255), nullable=False),
        sa.Column("b2_object_key", sa.String(1024), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("provenance_object_key", sa.String(1024)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("scene_id", "version", name="asset_scene_version"),
        sa.UniqueConstraint(
            "b2_object_key",
            name="uq_assets_b2_object_key",
        ),
    )
    op.create_index("ix_assets_project_id", "assets", ["project_id"])
    op.create_index("ix_assets_scene_id", "assets", ["scene_id"])

    op.create_table(
        "renders",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(64),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("b2_object_key", sa.String(1024)),
        sa.Column("duration_seconds", sa.Integer()),
        sa.Column("file_size_bytes", sa.BigInteger()),
        sa.Column("resolution", sa.String(32), nullable=False),
        sa.Column("captions_burned", sa.Boolean(), nullable=False),
        sa.Column("music_included", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint(
            "project_id",
            "version",
            name="render_project_version",
        ),
    )
    op.create_index("ix_renders_project_id", "renders", ["project_id"])


def downgrade() -> None:
    op.drop_table("renders")
    op.drop_table("assets")
    op.drop_table("generation_jobs")
    op.drop_table("scenes")
    op.drop_table("chapters")
    op.drop_table("projects")
