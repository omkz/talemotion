from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.core.ids import utc_now
from app.core.security import verify_password
from app.models.user import User, UserSession

PASSWORD = "correct horse battery staple"


def register(
    client: TestClient,
    *,
    email: str = "owner@example.com",
    name: str = "Owner",
) -> dict[str, object]:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": PASSWORD, "name": name},
    )
    assert response.status_code == 201
    return response.json()


def enable_csrf(client: TestClient) -> None:
    token = client.cookies.get("talemotion_csrf")
    assert token
    client.headers["X-CSRF-Token"] = token


def test_registration_hashes_password_and_rejects_duplicate(
    anonymous_client: TestClient,
    session_factory: sessionmaker[Session],
) -> None:
    user = register(anonymous_client)
    assert user["email"] == "owner@example.com"
    assert "password_hash" not in user
    with session_factory() as session:
        persisted = session.scalar(
            select(User).where(User.email == "owner@example.com")
        )
        assert persisted is not None
        assert persisted.password_hash != PASSWORD
        assert verify_password(PASSWORD, persisted.password_hash)

    duplicate = anonymous_client.post(
        "/api/v1/auth/register",
        json={
            "email": "OWNER@example.com",
            "password": PASSWORD,
            "name": "Duplicate",
        },
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "email_already_registered"


def test_login_current_user_logout_and_failed_login(
    anonymous_client: TestClient,
) -> None:
    register(anonymous_client)
    enable_csrf(anonymous_client)
    logout = anonymous_client.post("/api/v1/auth/logout")
    assert logout.status_code == 204
    assert anonymous_client.get("/api/v1/auth/me").status_code == 401

    failed = anonymous_client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "wrong password"},
    )
    assert failed.status_code == 401
    assert failed.json()["error"]["code"] == "invalid_credentials"

    logged_in = anonymous_client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": PASSWORD},
    )
    assert logged_in.status_code == 200
    current = anonymous_client.get("/api/v1/auth/me")
    assert current.status_code == 200
    assert current.json()["email"] == "owner@example.com"


def test_expired_session_is_rejected(
    anonymous_client: TestClient,
    session_factory: sessionmaker[Session],
) -> None:
    register(anonymous_client)
    with session_factory() as session:
        auth_session = session.scalar(select(UserSession))
        assert auth_session is not None
        auth_session.expires_at = utc_now() - timedelta(seconds=1)
        session.commit()
    response = anonymous_client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "session_expired"


def test_authenticated_mutation_requires_csrf(
    anonymous_client: TestClient,
    project_payload: dict[str, object],
) -> None:
    register(anonymous_client)
    response = anonymous_client.post("/api/v1/projects", json=project_payload)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "csrf_validation_failed"
