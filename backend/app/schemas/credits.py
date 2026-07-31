from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.models.credits import CreditTransaction, UsageRecord


class CreditBalanceResponse(BaseModel):
    balance: Decimal
    reserved: Decimal
    available: Decimal
    rates: dict[str, Decimal]


class CreditTransactionResponse(BaseModel):
    id: str
    job_id: str | None
    type: str
    amount: Decimal
    balance_after: Decimal
    description: str
    metadata: dict[str, object]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CreditTransactionListResponse(BaseModel):
    items: list[CreditTransactionResponse]


class UsageRecordResponse(BaseModel):
    id: str
    project_id: str
    job_id: str
    provider: str
    model_name: str
    operation: str
    input_units: Decimal
    output_units: Decimal
    provider_cost_usd: Decimal
    credits_charged: Decimal
    metadata: dict[str, object]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UsageRecordListResponse(BaseModel):
    items: list[UsageRecordResponse]


def transaction_to_response(
    transaction: CreditTransaction,
) -> CreditTransactionResponse:
    return CreditTransactionResponse(
        id=transaction.id,
        job_id=transaction.job_id,
        type=transaction.type.value,
        amount=transaction.amount,
        balance_after=transaction.balance_after,
        description=transaction.description,
        metadata=transaction.metadata_json,
        created_at=transaction.created_at,
    )


def usage_to_response(usage: UsageRecord) -> UsageRecordResponse:
    return UsageRecordResponse(
        id=usage.id,
        project_id=usage.project_id,
        job_id=usage.job_id,
        provider=usage.provider,
        model_name=usage.model_name,
        operation=usage.operation.value,
        input_units=usage.input_units,
        output_units=usage.output_units,
        provider_cost_usd=usage.provider_cost_usd,
        credits_charged=usage.credits_charged,
        metadata=usage.metadata_json,
        created_at=usage.created_at,
    )
