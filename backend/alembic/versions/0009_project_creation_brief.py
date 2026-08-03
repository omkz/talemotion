"""Add structured project creation brief fields.

Revision ID: 0009_project_creation_brief
Revises: 0008_usage_credits
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0009_project_creation_brief"
down_revision: str | None = "0008_usage_credits"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("source_notes", sa.Text(), nullable=True))
    op.add_column(
        "projects", sa.Column("content_type", sa.String(length=32), nullable=True)
    )
    op.add_column(
        "projects", sa.Column("tone", sa.String(length=32), nullable=True)
    )
    op.add_column(
        "projects", sa.Column("target_audience", sa.String(length=200), nullable=True)
    )
    op.execute(
        """
        UPDATE projects
        SET content_type = 'documentary',
            tone = 'cinematic',
            target_audience = 'General audience'
        WHERE content_type IS NULL OR tone IS NULL OR target_audience IS NULL
        """
    )
    op.execute(
        """
        UPDATE projects
        SET language = CASE LOWER(TRIM(language))
            WHEN 'english' THEN 'en'
            WHEN 'indonesian' THEN 'id'
            WHEN 'dutch' THEN 'nl'
            WHEN 'german' THEN 'de'
            WHEN 'french' THEN 'fr'
            WHEN 'spanish' THEN 'es'
            ELSE language
        END
        """
    )
    op.alter_column("projects", "content_type", nullable=False)
    op.alter_column("projects", "tone", nullable=False)
    op.alter_column("projects", "target_audience", nullable=False)
    op.create_check_constraint(
        "project_content_type",
        "projects",
        "content_type IN ('documentary', 'educational', 'fiction', "
        "'explainer', 'promotional')",
    )
    op.create_check_constraint(
        "project_tone",
        "projects",
        "tone IN ('cinematic', 'informative', 'dramatic', 'inspirational', 'neutral')",
    )


def downgrade() -> None:
    op.drop_constraint("project_tone", "projects", type_="check")
    op.drop_constraint("project_content_type", "projects", type_="check")
    op.drop_column("projects", "target_audience")
    op.drop_column("projects", "tone")
    op.drop_column("projects", "content_type")
    op.drop_column("projects", "source_notes")
