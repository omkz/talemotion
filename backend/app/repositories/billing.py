from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.credits import (
    CreditAccount,
    CreditTransaction,
    CreditTransactionType,
    UsageOperation,
    UsageRecord,
)
from app.models.job import GenerationJob


class BillingRepository:
    def __init__(self, session: Session, user_id: str | None = None) -> None:
        self.session = session
        self.user_id = user_id

    def lock_idempotency_key(self, key: str) -> None:
        self.session.execute(
            select(func.pg_advisory_xact_lock(func.hashtext(key)))
        )

    def account(self, user_id: str) -> CreditAccount | None:
        statement = select(CreditAccount).where(CreditAccount.user_id == user_id)
        if self.user_id is not None:
            statement = statement.where(CreditAccount.user_id == self.user_id)
        return self.session.scalar(statement)

    def account_for_update(self, user_id: str) -> CreditAccount | None:
        statement = (
            select(CreditAccount)
            .where(CreditAccount.user_id == user_id)
            .with_for_update()
        )
        if self.user_id is not None:
            statement = statement.where(CreditAccount.user_id == self.user_id)
        return self.session.scalar(statement)

    def create_account(self, user_id: str) -> CreditAccount:
        account = CreditAccount(
            user_id=user_id,
            balance=Decimal("0"),
            reserved_balance=Decimal("0"),
        )
        self.session.add(account)
        self.session.flush()
        return account

    def transaction(
        self,
        job_id: str,
        transaction_type: CreditTransactionType,
    ) -> CreditTransaction | None:
        statement = select(CreditTransaction).where(
            CreditTransaction.job_id == job_id,
            CreditTransaction.type == transaction_type,
        )
        if self.user_id is not None:
            statement = statement.where(
                CreditTransaction.user_id == self.user_id
            )
        return self.session.scalar(statement)

    def has_initial_grant(self, user_id: str) -> bool:
        return bool(
            self.session.scalar(
                select(func.count(CreditTransaction.id)).where(
                    CreditTransaction.user_id == user_id,
                    CreditTransaction.type == CreditTransactionType.GRANT,
                    CreditTransaction.metadata_json["source"].astext
                    == "registration",
                )
            )
        )

    def add_transaction(
        self,
        *,
        user_id: str,
        job_id: str | None,
        transaction_type: CreditTransactionType,
        amount: Decimal,
        balance_after: Decimal,
        description: str,
        metadata: dict[str, object] | None = None,
    ) -> CreditTransaction:
        transaction = CreditTransaction(
            user_id=user_id,
            job_id=job_id,
            type=transaction_type,
            amount=amount,
            balance_after=balance_after,
            description=description,
            metadata_json=metadata or {},
        )
        self.session.add(transaction)
        self.session.flush()
        return transaction

    def usage_by_key(self, key: str) -> UsageRecord | None:
        statement = select(UsageRecord).where(
            UsageRecord.idempotency_key == key
        )
        if self.user_id is not None:
            statement = statement.where(UsageRecord.user_id == self.user_id)
        return self.session.scalar(statement)

    def add_usage(
        self,
        *,
        idempotency_key: str,
        user_id: str,
        project_id: str,
        job_id: str,
        provider: str,
        model_name: str,
        operation: UsageOperation,
        input_units: Decimal,
        output_units: Decimal,
        provider_cost_usd: Decimal,
        credits_charged: Decimal,
        metadata: dict[str, object] | None = None,
    ) -> UsageRecord:
        usage = UsageRecord(
            idempotency_key=idempotency_key,
            user_id=user_id,
            project_id=project_id,
            job_id=job_id,
            provider=provider,
            model_name=model_name,
            operation=operation,
            input_units=input_units,
            output_units=output_units,
            provider_cost_usd=provider_cost_usd,
            credits_charged=credits_charged,
            metadata_json=metadata or {},
        )
        self.session.add(usage)
        self.session.flush()
        return usage

    def billable_usage_total(self, billing_job_id: str) -> Decimal:
        total = self.session.scalar(
            select(func.coalesce(func.sum(UsageRecord.credits_charged), 0))
            .join(GenerationJob, GenerationJob.id == UsageRecord.job_id)
            .where(
                or_(
                    GenerationJob.id == billing_job_id,
                    GenerationJob.parent_job_id == billing_job_id,
                )
            )
        )
        return Decimal(total or 0)

    def list_transactions(
        self,
        user_id: str,
        *,
        limit: int = 50,
    ) -> list[CreditTransaction]:
        statement = (
            select(CreditTransaction)
            .where(CreditTransaction.user_id == user_id)
            .order_by(
                CreditTransaction.created_at.desc(),
                CreditTransaction.id.desc(),
            )
            .limit(limit)
        )
        if self.user_id is not None:
            statement = statement.where(
                CreditTransaction.user_id == self.user_id
            )
        return list(self.session.scalars(statement))

    def list_usage(
        self,
        user_id: str,
        *,
        limit: int = 50,
    ) -> list[UsageRecord]:
        statement = (
            select(UsageRecord)
            .where(UsageRecord.user_id == user_id)
            .order_by(UsageRecord.created_at.desc(), UsageRecord.id.desc())
            .limit(limit)
        )
        if self.user_id is not None:
            statement = statement.where(UsageRecord.user_id == self.user_id)
        return list(self.session.scalars(statement))

    def commit(self) -> None:
        self.session.commit()

    def rollback(self) -> None:
        self.session.rollback()
