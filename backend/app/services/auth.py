from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.errors import ApiError
from app.core.ids import utc_now
from app.core.security import (
    csrf_token_for,
    hash_password,
    hash_session_token,
    new_session_token,
    verify_password,
)
from app.models.user import User, UserSession
from app.repositories.auth import AuthRepository
from app.schemas.auth import LoginRequest, RegisterRequest


@dataclass(frozen=True, slots=True)
class CreatedSession:
    user: User
    auth_session: UserSession
    token: str
    csrf_token: str


class AuthService:
    def __init__(self, repository: AuthRepository) -> None:
        self.repository = repository

    def register(self, request: RegisterRequest) -> CreatedSession:
        email = request.email.strip().lower()
        if self.repository.get_user_by_email(email) is not None:
            raise ApiError(
                status_code=409,
                code="email_already_registered",
                message="An account with this email already exists.",
            )
        try:
            user = self.repository.create_user(
                email=email,
                password_hash=hash_password(request.password),
                name=request.name,
            )
            created = self._create_session(user)
            self.repository.commit()
            return created
        except IntegrityError as error:
            self.repository.rollback()
            raise ApiError(
                status_code=409,
                code="email_already_registered",
                message="An account with this email already exists.",
            ) from error

    def login(self, request: LoginRequest) -> CreatedSession:
        user = self.repository.get_user_by_email(request.email)
        if user is None or not verify_password(request.password, user.password_hash):
            raise ApiError(
                status_code=401,
                code="invalid_credentials",
                message="The email or password is incorrect.",
            )
        created = self._create_session(user)
        self.repository.commit()
        return created

    def logout(self, auth_session: UserSession) -> None:
        self.repository.delete_session(auth_session)
        self.repository.commit()

    def _create_session(self, user: User) -> CreatedSession:
        token = new_session_token()
        token_hash = hash_session_token(token)
        auth_session = self.repository.create_session(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=utc_now() + timedelta(days=settings.session_ttl_days),
        )
        return CreatedSession(
            user=user,
            auth_session=auth_session,
            token=token,
            csrf_token=csrf_token_for(token_hash),
        )
