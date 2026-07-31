from sqlalchemy.exc import IntegrityError

from app.auth.passwords import hash_password, verify_password
from app.auth.sessions import (
    CreatedSession,
    create_session,
    revoke_session,
)
from app.core.errors import ApiError
from app.models.user import User, UserSession
from app.repositories.auth import AuthRepository
from app.repositories.billing import BillingRepository
from app.schemas.auth import LoginRequest, RegisterRequest
from app.services.credits import CreditService


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
            CreditService(
                BillingRepository(self.repository.session, user.id)
            ).grant_new_user(user.id)
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
        revoke_session(self.repository, auth_session)
        self.repository.commit()

    def _create_session(self, user: User) -> CreatedSession:
        return create_session(self.repository, user)
