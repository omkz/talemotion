from fastapi import APIRouter, Response, status

from app.api.dependencies import CurrentAuth, DatabaseSession, MutationAuth
from app.core.config import settings
from app.repositories.auth import AuthRepository
from app.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    UserResponse,
    user_to_response,
)
from app.schemas.common import ErrorResponse
from app.services.auth import AuthService, CreatedSession

router = APIRouter(prefix="/auth", tags=["Authentication"])
ERROR_RESPONSES = {
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
    409: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
}


def _set_auth_cookies(response: Response, created: CreatedSession) -> None:
    max_age = settings.session_ttl_days * 24 * 60 * 60
    response.set_cookie(
        settings.session_cookie_name,
        created.token,
        max_age=max_age,
        httponly=True,
        secure=settings.secure_session_cookie,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        settings.csrf_cookie_name,
        created.csrf_token,
        max_age=max_age,
        httponly=False,
        secure=settings.secure_session_cookie,
        samesite="lax",
        path="/",
    )


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    responses=ERROR_RESPONSES,
)
def register(
    request: RegisterRequest,
    response: Response,
    session: DatabaseSession,
) -> UserResponse:
    created = AuthService(AuthRepository(session)).register(request)
    _set_auth_cookies(response, created)
    return user_to_response(created.user)


@router.post("/login", response_model=UserResponse, responses=ERROR_RESPONSES)
def login(
    request: LoginRequest,
    response: Response,
    session: DatabaseSession,
) -> UserResponse:
    created = AuthService(AuthRepository(session)).login(request)
    _set_auth_cookies(response, created)
    return user_to_response(created.user)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=ERROR_RESPONSES,
)
def logout(
    response: Response,
    auth: MutationAuth,
    session: DatabaseSession,
) -> Response:
    AuthService(AuthRepository(session)).logout(auth.auth_session)
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
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserResponse, responses=ERROR_RESPONSES)
def current_user(auth: CurrentAuth) -> UserResponse:
    return user_to_response(auth.user)
