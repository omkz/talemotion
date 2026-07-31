"""Add decimal-safe internal credits and provider usage.

Revision ID: 0008_usage_credits
Revises: 0007_session_csrf
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0008_usage_credits"
down_revision: str | None = "0007_session_csrf"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    transaction_type = sa.Enum(
        "grant",
        "reservation",
        "charge",
        "release",
        "refund",
        "adjustment",
        name="credittransactiontype",
        native_enum=False,
        length=16,
    )
    usage_operation = sa.Enum(
        "storyboard_generation",
        "image_generation",
        "video_generation",
        "tts_generation",
        "music_generation",
        "final_render",
        name="usageoperation",
        native_enum=False,
        length=32,
    )
    op.create_table(
        "credit_accounts",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("balance", sa.Numeric(18, 4), nullable=False),
        sa.Column("reserved_balance", sa.Numeric(18, 4), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "balance >= 0",
            name="credit_account_balance_nonnegative",
        ),
        sa.CheckConstraint(
            "reserved_balance >= 0",
            name="credit_account_reserved_nonnegative",
        ),
        sa.CheckConstraint(
            "reserved_balance <= balance",
            name="credit_account_reserved_within_balance",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_credit_accounts_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_credit_accounts")),
    )
    op.create_index(
        op.f("ix_credit_accounts_user_id"),
        "credit_accounts",
        ["user_id"],
        unique=True,
    )
    op.create_table(
        "credit_transactions",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("job_id", sa.String(length=64), nullable=True),
        sa.Column("type", transaction_type, nullable=False),
        sa.Column("amount", sa.Numeric(18, 4), nullable=False),
        sa.Column("balance_after", sa.Numeric(18, 4), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["job_id"],
            ["generation_jobs.id"],
            name=op.f("fk_credit_transactions_job_id_generation_jobs"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_credit_transactions_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_credit_transactions")),
        sa.UniqueConstraint(
            "job_id",
            "type",
            name="credit_transaction_job_type",
        ),
    )
    for column in ("job_id", "type", "user_id"):
        op.create_index(
            op.f(f"ix_credit_transactions_{column}"),
            "credit_transactions",
            [column],
            unique=False,
        )
    op.create_table(
        "usage_records",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("idempotency_key", sa.String(length=200), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("project_id", sa.String(length=64), nullable=False),
        sa.Column("job_id", sa.String(length=64), nullable=False),
        sa.Column("provider", sa.String(length=100), nullable=False),
        sa.Column("model_name", sa.String(length=150), nullable=False),
        sa.Column("operation", usage_operation, nullable=False),
        sa.Column("input_units", sa.Numeric(20, 6), nullable=False),
        sa.Column("output_units", sa.Numeric(20, 6), nullable=False),
        sa.Column("provider_cost_usd", sa.Numeric(18, 6), nullable=False),
        sa.Column("credits_charged", sa.Numeric(18, 4), nullable=False),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["job_id"],
            ["generation_jobs.id"],
            name=op.f("fk_usage_records_job_id_generation_jobs"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name=op.f("fk_usage_records_project_id_projects"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_usage_records_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_usage_records")),
    )
    for column in ("idempotency_key", "job_id", "operation", "project_id", "user_id"):
        op.create_index(
            op.f(f"ix_usage_records_{column}"),
            "usage_records",
            [column],
            unique=column == "idempotency_key",
        )
    op.execute(
        """
        INSERT INTO credit_accounts
            (id, user_id, balance, reserved_balance, created_at, updated_at)
        SELECT
            'credit_' || md5(id), id, 100.0000, 0.0000,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM users
        ON CONFLICT (user_id) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO credit_transactions
            (id, user_id, job_id, type, amount, balance_after,
             description, metadata, created_at)
        SELECT
            'credit_txn_' || md5(id), id, NULL, 'grant',
            100.0000, 100.0000, 'Initial free credit grant',
            '{"source": "ownership_migration"}'::jsonb, CURRENT_TIMESTAMP
        FROM users
        WHERE NOT EXISTS (
            SELECT 1 FROM credit_transactions credit_txn
            WHERE credit_txn.user_id = users.id
              AND credit_txn.type = 'grant'
        )
        """
    )


def downgrade() -> None:
    for column in reversed(
        ("idempotency_key", "job_id", "operation", "project_id", "user_id")
    ):
        op.drop_index(
            op.f(f"ix_usage_records_{column}"),
            table_name="usage_records",
        )
    op.drop_table("usage_records")
    for column in reversed(("job_id", "type", "user_id")):
        op.drop_index(
            op.f(f"ix_credit_transactions_{column}"),
            table_name="credit_transactions",
        )
    op.drop_table("credit_transactions")
    op.drop_index(
        op.f("ix_credit_accounts_user_id"),
        table_name="credit_accounts",
    )
    op.drop_table("credit_accounts")
