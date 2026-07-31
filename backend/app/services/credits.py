from decimal import Decimal

from app.core.config import settings
from app.core.errors import ApiError
from app.models.credits import (
    CreditAccount,
    CreditTransaction,
    CreditTransactionType,
    UsageOperation,
    UsageRecord,
)
from app.models.job import GenerationJob
from app.repositories.billing import BillingRepository

ZERO = Decimal("0")


class CreditService:
    def __init__(self, repository: BillingRepository) -> None:
        self.repository = repository

    def grant_new_user(self, user_id: str) -> CreditAccount:
        account = self.repository.account_for_update(user_id)
        if account is None:
            account = self.repository.create_account(user_id)
        if self.repository.has_initial_grant(user_id):
            return account
        amount = settings.new_user_free_credits
        account.balance += amount
        self.repository.add_transaction(
            user_id=user_id,
            job_id=None,
            transaction_type=CreditTransactionType.GRANT,
            amount=amount,
            balance_after=account.balance,
            description="Initial free credit grant",
            metadata={"source": "registration"},
        )
        return account

    def account(self, user_id: str) -> CreditAccount:
        account = self.repository.account(user_id)
        if account is None:
            raise ApiError(
                status_code=404,
                code="credit_account_not_found",
                message="Credit account not found.",
            )
        return account

    def reserve(
        self,
        *,
        job: GenerationJob,
        amount: Decimal,
        description: str,
    ) -> None:
        if amount < ZERO:
            raise ValueError("Credit reservation cannot be negative.")
        self.repository.lock_idempotency_key(f"credit-reservation:{job.id}")
        existing = self.repository.transaction(
            job.id,
            CreditTransactionType.RESERVATION,
        )
        if existing is not None:
            return
        account = self.repository.account_for_update(job.user_id)
        if account is None:
            raise ApiError(
                status_code=402,
                code="insufficient_credits",
                message="A credit account is required before generation.",
                details={"required": str(amount), "available": "0"},
            )
        available = account.balance - account.reserved_balance
        if available < amount:
            raise ApiError(
                status_code=402,
                code="insufficient_credits",
                message="There are not enough credits for this operation.",
                details={
                    "required": str(amount),
                    "available": str(available),
                },
            )
        account.reserved_balance += amount
        self.repository.add_transaction(
            user_id=job.user_id,
            job_id=job.id,
            transaction_type=CreditTransactionType.RESERVATION,
            amount=amount,
            balance_after=account.balance,
            description=description,
            metadata={"available_after": str(available - amount)},
        )

    def record_usage(
        self,
        *,
        job: GenerationJob,
        operation: UsageOperation,
        provider: str,
        model_name: str,
        credits: Decimal,
        idempotency_key: str,
        input_units: Decimal = ZERO,
        output_units: Decimal = Decimal("1"),
        provider_cost_usd: Decimal = ZERO,
        metadata: dict[str, object] | None = None,
    ) -> UsageRecord:
        self.repository.lock_idempotency_key(f"credit-usage:{idempotency_key}")
        existing = self.repository.usage_by_key(idempotency_key)
        if existing is not None:
            return existing
        return self.repository.add_usage(
            idempotency_key=idempotency_key,
            user_id=job.user_id,
            project_id=job.project_id,
            job_id=job.id,
            provider=provider,
            model_name=model_name,
            operation=operation,
            input_units=input_units,
            output_units=output_units,
            provider_cost_usd=provider_cost_usd,
            credits_charged=credits,
            metadata=metadata,
        )

    def settle(self, billing_job_id: str) -> None:
        self.repository.lock_idempotency_key(
            f"credit-settlement:{billing_job_id}"
        )
        reservation = self.repository.transaction(
            billing_job_id,
            CreditTransactionType.RESERVATION,
        )
        if reservation is None:
            return
        if (
            self.repository.transaction(
                billing_job_id,
                CreditTransactionType.CHARGE,
            )
            is not None
            or self.repository.transaction(
                billing_job_id,
                CreditTransactionType.RELEASE,
            )
            is not None
        ):
            return
        account = self.repository.account_for_update(reservation.user_id)
        if account is None:
            raise RuntimeError("Reserved credit account is unavailable.")
        reserved = reservation.amount
        actual = self.repository.billable_usage_total(billing_job_id)
        if actual > reserved:
            raise RuntimeError("Actual credits exceeded the maximum reservation.")
        if account.balance < actual or account.reserved_balance < reserved:
            raise RuntimeError("Credit account balances are inconsistent.")
        account.reserved_balance -= reserved
        account.balance -= actual
        if actual > ZERO:
            self.repository.add_transaction(
                user_id=reservation.user_id,
                job_id=billing_job_id,
                transaction_type=CreditTransactionType.CHARGE,
                amount=-actual,
                balance_after=account.balance,
                description="Final charge for provider usage",
                metadata={"reserved": str(reserved)},
            )
        unused = reserved - actual
        if unused > ZERO:
            self.repository.add_transaction(
                user_id=reservation.user_id,
                job_id=billing_job_id,
                transaction_type=CreditTransactionType.RELEASE,
                amount=unused,
                balance_after=account.balance,
                description="Released unused reserved credits",
                metadata={"charged": str(actual)},
            )

    def transactions(self, user_id: str) -> list[CreditTransaction]:
        return self.repository.list_transactions(user_id)

    def usage(self, user_id: str) -> list[UsageRecord]:
        return self.repository.list_usage(user_id)
