"""Persist a hash of each session's random CSRF token.

Revision ID: 0007_session_csrf
Revises: 0006_authentication_ownership
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0007_session_csrf"
down_revision: str | None = "0006_authentication_ownership"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_sessions",
        sa.Column("csrf_token_hash", sa.String(length=64), nullable=True),
    )
    # Existing tokens cannot safely reveal a new raw CSRF value, so revoke them.
    op.execute("DELETE FROM user_sessions")
    op.alter_column("user_sessions", "csrf_token_hash", nullable=False)


def downgrade() -> None:
    op.drop_column("user_sessions", "csrf_token_hash")
