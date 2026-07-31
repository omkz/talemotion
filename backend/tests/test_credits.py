from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.errors import ApiError
from app.models.credits import (
    CreditAccount,
    CreditTransaction,
    CreditTransactionType,
    UsageOperation,
    UsageRecord,
)
from app.models.job import GenerationJob, JobType
from app.repositories.billing import BillingRepository
from app.services.credits import CreditService


def _identity(client: TestClient) -> dict[str, str]:
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 200
    return response.json()


def _project(client: TestClient, payload: dict[str, object]) -> str:
    response = client.post("/api/v1/projects", json=payload)
    assert response.status_code == 201
    return response.json()["id"]


def _job(
    session: Session,
    *,
    user_id: str,
    project_id: str,
    job_type: JobType = JobType.STORYBOARD,
) -> GenerationJob:
    job = GenerationJob(
        user_id=user_id,
        project_id=project_id,
        type=job_type,
        input_payload={},
    )
    session.add(job)
    session.flush()
    return job


def test_registration_grants_credits_once(
    client: TestClient,
    session_factory: sessionmaker[Session],
) -> None:
    user_id = _identity(client)["id"]
    with session_factory() as session:
        service = CreditService(BillingRepository(session, user_id))
        service.grant_new_user(user_id)
        service.grant_new_user(user_id)
        session.commit()
        account = session.scalar(
            select(CreditAccount).where(CreditAccount.user_id == user_id)
        )
        grants = session.scalar(
            select(func.count(CreditTransaction.id)).where(
                CreditTransaction.user_id == user_id,
                CreditTransaction.type == CreditTransactionType.GRANT,
            )
        )
        assert account is not None
        assert account.balance == Decimal("100.0000")
        assert account.reserved_balance == Decimal("0.0000")
        assert grants == 1


def test_credit_endpoints_are_scoped_to_current_user(
    client: TestClient,
) -> None:
    balance = client.get("/api/v1/credits")
    transactions = client.get("/api/v1/credits/transactions")
    usage = client.get("/api/v1/usage")
    assert balance.status_code == 200
    assert Decimal(balance.json()["available"]) == Decimal("100")
    assert len(transactions.json()["items"]) == 1
    assert transactions.json()["items"][0]["type"] == "grant"
    assert usage.json() == {"items": []}


def test_reservation_and_partial_charge_are_decimal_safe_and_idempotent(
    client: TestClient,
    session_factory: sessionmaker[Session],
    project_payload: dict[str, object],
) -> None:
    user_id = _identity(client)["id"]
    project_id = _project(client, project_payload)
    with session_factory() as session:
        job = _job(session, user_id=user_id, project_id=project_id)
        service = CreditService(BillingRepository(session, user_id))
        service.reserve(
            job=job,
            amount=Decimal("12.2500"),
            description="Test reservation",
        )
        service.reserve(
            job=job,
            amount=Decimal("12.2500"),
            description="Duplicate reservation",
        )
        service.record_usage(
            job=job,
            operation=UsageOperation.IMAGE_GENERATION,
            provider="test-provider",
            model_name="test-model",
            credits=Decimal("4.1250"),
            idempotency_key=f"usage:{job.id}:image",
            provider_cost_usd=Decimal("0.012345"),
        )
        service.record_usage(
            job=job,
            operation=UsageOperation.IMAGE_GENERATION,
            provider="test-provider",
            model_name="test-model",
            credits=Decimal("4.1250"),
            idempotency_key=f"usage:{job.id}:image",
        )
        service.settle(job.id)
        service.settle(job.id)
        session.commit()

        account = service.account(user_id)
        assert account.balance == Decimal("95.8750")
        assert account.reserved_balance == Decimal("0.0000")
        usage_count = session.scalar(
            select(func.count(UsageRecord.id)).where(
                UsageRecord.job_id == job.id
            )
        )
        assert usage_count == 1
        types = set(
            session.scalars(
                select(CreditTransaction.type).where(
                    CreditTransaction.job_id == job.id
                )
            )
        )
        assert types == {
            CreditTransactionType.RESERVATION,
            CreditTransactionType.CHARGE,
            CreditTransactionType.RELEASE,
        }


def test_failed_job_without_usage_releases_full_reservation(
    client: TestClient,
    session_factory: sessionmaker[Session],
    project_payload: dict[str, object],
) -> None:
    user_id = _identity(client)["id"]
    project_id = _project(client, project_payload)
    with session_factory() as session:
        job = _job(session, user_id=user_id, project_id=project_id)
        service = CreditService(BillingRepository(session, user_id))
        service.reserve(
            job=job,
            amount=Decimal("8"),
            description="Failure release",
        )
        service.settle(job.id)
        session.commit()
        account = service.account(user_id)
        assert account.balance == Decimal("100.0000")
        assert account.reserved_balance == Decimal("0.0000")


def test_parent_reservation_settles_aggregate_child_usage(
    client: TestClient,
    session_factory: sessionmaker[Session],
    project_payload: dict[str, object],
) -> None:
    user_id = _identity(client)["id"]
    project_id = _project(client, project_payload)
    with session_factory() as session:
        parent = _job(
            session,
            user_id=user_id,
            project_id=project_id,
            job_type=JobType.PROJECT_GENERATION,
        )
        children = [
            GenerationJob(
                user_id=user_id,
                project_id=project_id,
                parent_job_id=parent.id,
                type=JobType.SCENE_GENERATION,
                input_payload={},
            )
            for _ in range(2)
        ]
        session.add_all(children)
        session.flush()
        service = CreditService(BillingRepository(session, user_id))
        service.reserve(
            job=parent,
            amount=Decimal("24"),
            description="Aggregate scene reservation",
        )
        for index, child in enumerate(children):
            service.record_usage(
                job=child,
                operation=UsageOperation.IMAGE_GENERATION,
                provider="test-provider",
                model_name="test-model",
                credits=Decimal("12"),
                idempotency_key=f"usage:{child.id}:{index}",
            )
        service.settle(parent.id)
        session.commit()
        account = service.account(user_id)
        assert account.balance == Decimal("76.0000")
        assert account.reserved_balance == Decimal("0.0000")
        assert (
            session.scalar(
                select(CreditTransaction.amount).where(
                    CreditTransaction.job_id == parent.id,
                    CreditTransaction.type == CreditTransactionType.CHARGE,
                )
            )
            == Decimal("-24.0000")
        )


def test_insufficient_reservation_does_not_change_balance(
    client: TestClient,
    session_factory: sessionmaker[Session],
    project_payload: dict[str, object],
) -> None:
    user_id = _identity(client)["id"]
    project_id = _project(client, project_payload)
    with session_factory() as session:
        job = _job(session, user_id=user_id, project_id=project_id)
        service = CreditService(BillingRepository(session, user_id))
        with pytest.raises(ApiError) as raised:
            service.reserve(
                job=job,
                amount=Decimal("100.0001"),
                description="Too expensive",
            )
        assert raised.value.status_code == 402
        assert raised.value.code == "insufficient_credits"
        account = service.account(user_id)
        assert account.balance == Decimal("100.0000")
        assert account.reserved_balance == Decimal("0.0000")


def test_concurrent_reservations_cannot_overdraw_available_balance(
    client: TestClient,
    session_factory: sessionmaker[Session],
    project_payload: dict[str, object],
) -> None:
    user_id = _identity(client)["id"]
    project_id = _project(client, project_payload)
    with session_factory() as session:
        first = _job(session, user_id=user_id, project_id=project_id)
        second = _job(session, user_id=user_id, project_id=project_id)
        session.commit()
        job_ids = (first.id, second.id)

    def reserve(job_id: str) -> bool:
        with session_factory() as session:
            job = session.get(GenerationJob, job_id)
            assert job is not None
            try:
                CreditService(
                    BillingRepository(session, user_id)
                ).reserve(
                    job=job,
                    amount=Decimal("60"),
                    description="Concurrent reservation",
                )
                session.commit()
                return True
            except ApiError:
                session.rollback()
                return False

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(reserve, job_ids))
    assert sorted(results) == [False, True]
    with session_factory() as session:
        account = session.scalar(
            select(CreditAccount).where(CreditAccount.user_id == user_id)
        )
        assert account is not None
        assert account.reserved_balance == Decimal("60.0000")
