from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.models.user import User, UserSession


class AuthRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_user_by_email(self, email: str) -> User | None:
        return self.session.scalar(
            select(User).where(User.email == email.strip().lower())
        )

    def get_user(self, user_id: str) -> User | None:
        return self.session.get(User, user_id)

    def create_user(
        self,
        *,
        email: str,
        password_hash: str,
        name: str,
    ) -> User:
        user = User(
            email=email.strip().lower(),
            password_hash=password_hash,
            name=name.strip(),
        )
        self.session.add(user)
        self.session.flush()
        return user

    def create_session(
        self,
        *,
        user_id: str,
        token_hash: str,
        csrf_token_hash: str,
        expires_at: datetime,
    ) -> UserSession:
        auth_session = UserSession(
            user_id=user_id,
            token_hash=token_hash,
            csrf_token_hash=csrf_token_hash,
            expires_at=expires_at,
        )
        self.session.add(auth_session)
        self.session.flush()
        return auth_session

    def get_session_by_token_hash(self, token_hash: str) -> UserSession | None:
        return self.session.scalar(
            select(UserSession)
            .where(UserSession.token_hash == token_hash)
            .options(selectinload(UserSession.user))
        )

    def delete_session(self, auth_session: UserSession) -> None:
        self.session.delete(auth_session)

    def delete_expired_sessions(self, now: datetime) -> None:
        self.session.execute(
            delete(UserSession).where(UserSession.expires_at <= now)
        )

    def commit(self) -> None:
        self.session.commit()

    def rollback(self) -> None:
        self.session.rollback()
