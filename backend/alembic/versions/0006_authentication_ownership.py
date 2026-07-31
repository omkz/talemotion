"""Add cookie sessions and user-owned resources.

Revision ID: 0006_authentication_ownership
Revises: 0005_job_reliability
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0006_authentication_ownership"
down_revision: str | None = "0005_job_reliability"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEVELOPMENT_USER_ID = "user_development"


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=512), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_table(
        "user_sessions",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_user_sessions_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_sessions")),
    )
    op.create_index(
        op.f("ix_user_sessions_expires_at"),
        "user_sessions",
        ["expires_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_user_sessions_token_hash"),
        "user_sessions",
        ["token_hash"],
        unique=True,
    )
    op.create_index(
        op.f("ix_user_sessions_user_id"),
        "user_sessions",
        ["user_id"],
        unique=False,
    )

    op.execute(
        sa.text(
            """
            INSERT INTO users
                (id, email, password_hash, name, created_at, updated_at)
            VALUES
                (:id, 'development@talemotion.local', 'disabled',
                 'Development User', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
        ).bindparams(id=DEVELOPMENT_USER_ID)
    )

    for table in ("projects", "generation_jobs", "assets", "renders"):
        op.add_column(
            table,
            sa.Column("user_id", sa.String(length=64), nullable=True),
        )
        op.execute(
            sa.text(f"UPDATE {table} SET user_id = :user_id").bindparams(
                user_id=DEVELOPMENT_USER_ID
            )
        )
        op.alter_column(table, "user_id", nullable=False)
        op.create_foreign_key(
            op.f(f"fk_{table}_user_id_users"),
            table,
            "users",
            ["user_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        op.create_index(
            op.f(f"ix_{table}_user_id"),
            table,
            ["user_id"],
            unique=False,
        )


def downgrade() -> None:
    for table in reversed(("projects", "generation_jobs", "assets", "renders")):
        op.drop_index(op.f(f"ix_{table}_user_id"), table_name=table)
        op.drop_constraint(
            op.f(f"fk_{table}_user_id_users"),
            table,
            type_="foreignkey",
        )
        op.drop_column(table, "user_id")
    op.drop_index(op.f("ix_user_sessions_user_id"), table_name="user_sessions")
    op.drop_index(
        op.f("ix_user_sessions_token_hash"),
        table_name="user_sessions",
    )
    op.drop_index(
        op.f("ix_user_sessions_expires_at"),
        table_name="user_sessions",
    )
    op.drop_table("user_sessions")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
