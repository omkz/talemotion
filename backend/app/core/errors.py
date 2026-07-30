from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from app.core.ids import new_resource_id


@dataclass(slots=True)
class ApiError(Exception):
    status_code: int
    code: str
    message: str
    details: dict[str, object] = field(default_factory=dict)


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        request_id = request.headers.get("X-Request-ID") or new_resource_id("req")
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


def _error_content(
    request: Request,
    *,
    code: str,
    message: str,
    details: dict[str, object],
) -> dict[str, object]:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details,
            "request_id": request.state.request_id,
        }
    }


async def api_error_handler(request: Request, error: ApiError) -> JSONResponse:
    return JSONResponse(
        status_code=error.status_code,
        content=_error_content(
            request,
            code=error.code,
            message=error.message,
            details=error.details,
        ),
    )


async def validation_error_handler(
    request: Request,
    error: RequestValidationError,
) -> JSONResponse:
    issues = [
        {
            "location": [str(part) for part in issue["loc"]],
            "message": issue["msg"],
            "type": issue["type"],
        }
        for issue in error.errors()
    ]
    return JSONResponse(
        status_code=422,
        content=_error_content(
            request,
            code="validation_error",
            message="Request validation failed.",
            details={"issues": issues},
        ),
    )


async def http_error_handler(
    request: Request,
    error: StarletteHTTPException,
) -> JSONResponse:
    code = (
        "resource_not_found"
        if error.status_code == 404
        else "method_not_allowed"
        if error.status_code == 405
        else "http_error"
    )
    return JSONResponse(
        status_code=error.status_code,
        content=_error_content(
            request,
            code=code,
            message=str(error.detail),
            details={},
        ),
        headers=error.headers,
    )


async def unexpected_error_handler(
    request: Request,
    _error: Exception,
) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content=_error_content(
            request,
            code="unexpected_server_error",
            message="An unexpected server error occurred.",
            details={},
        ),
    )


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, api_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_error_handler)
    app.add_exception_handler(Exception, unexpected_error_handler)
