from fastapi import APIRouter, Response, status

from app.api.dependencies import CurrentAuth, DatabaseSession, MutationAuth
from app.auth.sessions import (
    CreatedSession,
    clear_auth_cookies,
    rotate_csrf_token,
    set_auth_cookies,
    set_csrf_cookie,
)
from app.repositories.auth import AuthRepository
from app.schemas.auth import (
    CsrfTokenResponse,
    LoginRequest,
    RegisterRequest,
    UserResponse,
    user_to_response,
)
from app.schemas.common import ErrorResponse
from app.services.auth import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])
ERROR_RESPONSES = {
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
    409: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
}


def _set_auth_cookies(response: Response, created: CreatedSession) -> None:
    set_auth_cookies(
        response,
        session_token=created.token,
        csrf_token=created.csrf_token,
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
    clear_auth_cookies(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserResponse, responses=ERROR_RESPONSES)
def current_user(auth: CurrentAuth) -> UserResponse:
    return user_to_response(auth.user)


@router.get(
    "/csrf",
    response_model=CsrfTokenResponse,
    responses=ERROR_RESPONSES,
)
def refresh_csrf_token(
    response: Response,
    auth: CurrentAuth,
    session: DatabaseSession,
) -> CsrfTokenResponse:
    token = rotate_csrf_token(
        AuthRepository(session),
        auth.auth_session,
    )
    set_csrf_cookie(response, csrf_token=token)
    return CsrfTokenResponse(csrf_token=token)
