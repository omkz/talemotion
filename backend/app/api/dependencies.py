from dataclasses import dataclass
from datetime import timedelta
from typing import Annotated

from fastapi import Cookie, Depends, Header
from sqlalchemy.orm import Session

from app.auth.sessions import csrf_token_matches, hash_token
from app.core.config import settings
from app.core.database import get_db
from app.core.errors import ApiError
from app.core.ids import utc_now
from app.models.user import User, UserSession
from app.repositories.auth import AuthRepository

DatabaseSession = Annotated[Session, Depends(get_db)]


@dataclass(frozen=True, slots=True)
class AuthContext:
    user: User
    auth_session: UserSession


def get_current_user(
    session: DatabaseSession,
    token: Annotated[str | None, Cookie(alias=settings.session_cookie_name)] = None,
) -> AuthContext:
    if not token:
        raise ApiError(
            status_code=401,
            code="authentication_required",
            message="Authentication is required.",
        )
    repository = AuthRepository(session)
    auth_session = repository.get_session_by_token_hash(hash_token(token))
    now = utc_now()
    if auth_session is None or auth_session.expires_at <= now:
        if auth_session is not None:
            repository.delete_session(auth_session)
            repository.commit()
        raise ApiError(
            status_code=401,
            code="session_expired",
            message="The session is missing or has expired.",
        )
    if now - auth_session.last_used_at >= timedelta(minutes=5):
        auth_session.last_used_at = now
        repository.commit()
    return AuthContext(auth_session.user, auth_session)


def require_csrf(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    csrf_cookie: Annotated[
        str | None, Cookie(alias=settings.csrf_cookie_name)
    ] = None,
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> AuthContext:
    if not csrf_token_matches(
        auth.auth_session,
        cookie_token=csrf_cookie,
        header_token=csrf_header,
    ):
        raise ApiError(
            status_code=403,
            code="csrf_validation_failed",
            message="The CSRF token is missing or invalid.",
        )
    return auth


CurrentAuth = Annotated[AuthContext, Depends(get_current_user)]
MutationAuth = Annotated[AuthContext, Depends(require_csrf)]
