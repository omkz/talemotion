import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import timedelta

from fastapi import Response

from app.core.config import settings
from app.core.ids import utc_now
from app.models.user import User, UserSession
from app.repositories.auth import AuthRepository


@dataclass(frozen=True, slots=True)
class CreatedSession:
    user: User
    auth_session: UserSession
    token: str
    csrf_token: str


def generate_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(repository: AuthRepository, user: User) -> CreatedSession:
    token = generate_token()
    csrf_token = generate_token()
    auth_session = repository.create_session(
        user_id=user.id,
        token_hash=hash_token(token),
        csrf_token_hash=hash_token(csrf_token),
        expires_at=utc_now() + timedelta(days=settings.session_ttl_days),
    )
    return CreatedSession(user, auth_session, token, csrf_token)


def revoke_session(
    repository: AuthRepository,
    auth_session: UserSession,
) -> None:
    repository.delete_session(auth_session)


def rotate_csrf_token(
    repository: AuthRepository,
    auth_session: UserSession,
) -> str:
    csrf_token = generate_token()
    auth_session.csrf_token_hash = hash_token(csrf_token)
    repository.commit()
    return csrf_token


def csrf_token_matches(
    auth_session: UserSession,
    *,
    cookie_token: str | None,
    header_token: str | None,
) -> bool:
    if not cookie_token or not header_token:
        return False
    return hmac.compare_digest(cookie_token, header_token) and hmac.compare_digest(
        hash_token(header_token),
        auth_session.csrf_token_hash,
    )


def set_auth_cookies(
    response: Response,
    *,
    session_token: str,
    csrf_token: str,
) -> None:
    max_age = settings.session_ttl_days * 24 * 60 * 60
    response.set_cookie(
        settings.session_cookie_name,
        session_token,
        max_age=max_age,
        httponly=True,
        secure=settings.secure_session_cookie,
        samesite="lax",
        path="/",
    )
    set_csrf_cookie(response, csrf_token=csrf_token, max_age=max_age)


def set_csrf_cookie(
    response: Response,
    *,
    csrf_token: str,
    max_age: int | None = None,
) -> None:
    response.set_cookie(
        settings.csrf_cookie_name,
        csrf_token,
        max_age=max_age,
        httponly=False,
        secure=settings.secure_session_cookie,
        samesite="lax",
        path="/",
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(
        settings.session_cookie_name,
        httponly=True,
        secure=settings.secure_session_cookie,
        samesite="lax",
        path="/",
    )
    response.delete_cookie(
        settings.csrf_cookie_name,
        httponly=False,
        secure=settings.secure_session_cookie,
        samesite="lax",
        path="/",
    )
