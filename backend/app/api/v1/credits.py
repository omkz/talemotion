from fastapi import APIRouter, Query

from app.api.dependencies import CurrentAuth, DatabaseSession
from app.billing.pricing import pricing
from app.repositories.billing import BillingRepository
from app.schemas.common import ErrorResponse
from app.schemas.credits import (
    CreditBalanceResponse,
    CreditTransactionListResponse,
    UsageRecordListResponse,
    transaction_to_response,
    usage_to_response,
)
from app.services.credits import CreditService

router = APIRouter(tags=["Credits"])
ERROR_RESPONSES = {401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}}


def _credits(session: DatabaseSession, user_id: str) -> CreditService:
    return CreditService(BillingRepository(session, user_id))


@router.get(
    "/credits",
    response_model=CreditBalanceResponse,
    responses=ERROR_RESPONSES,
)
def get_credit_balance(
    session: DatabaseSession,
    auth: CurrentAuth,
) -> CreditBalanceResponse:
    account = _credits(session, auth.user.id).account(auth.user.id)
    return CreditBalanceResponse(
        balance=account.balance,
        reserved=account.reserved_balance,
        available=account.balance - account.reserved_balance,
        rates={
            operation.value: amount
            for operation, amount in pricing.rates.items()
        },
    )


@router.get(
    "/credits/transactions",
    response_model=CreditTransactionListResponse,
    responses=ERROR_RESPONSES,
)
def list_credit_transactions(
    session: DatabaseSession,
    auth: CurrentAuth,
    limit: int = Query(default=50, ge=1, le=100),
) -> CreditTransactionListResponse:
    transactions = BillingRepository(
        session, auth.user.id
    ).list_transactions(auth.user.id, limit=limit)
    return CreditTransactionListResponse(
        items=[transaction_to_response(item) for item in transactions]
    )


@router.get(
    "/usage",
    response_model=UsageRecordListResponse,
    responses=ERROR_RESPONSES,
)
def list_usage(
    session: DatabaseSession,
    auth: CurrentAuth,
    limit: int = Query(default=50, ge=1, le=100),
) -> UsageRecordListResponse:
    usage = BillingRepository(session, auth.user.id).list_usage(
        auth.user.id,
        limit=limit,
    )
    return UsageRecordListResponse(
        items=[usage_to_response(item) for item in usage]
    )
