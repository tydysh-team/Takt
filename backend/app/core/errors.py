import logging
from collections.abc import Mapping
from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.exceptions import (
    AlreadyConnectedError,
    AuthenticationRequiredError,
    ConnectionNotFoundError,
    CsrfValidationError,
    DomainError,
    EmailAlreadyRegisteredError,
    ForbiddenError,
    InvalidCredentialsError,
    InvalidInvitationError,
    InvitationNotActiveError,
    InvitationNotFoundError,
    ProfileNotFoundError,
    RateLimitExceededError,
)
from app.schemas.error import ErrorDetail, ErrorResponse

logger = logging.getLogger(__name__)


def error_response(
    *,
    status_code: int,
    code: str,
    message: str,
    details: list[ErrorDetail] | None = None,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    payload = ErrorResponse.from_values(code=code, message=message, details=details)
    return JSONResponse(status_code=status_code, content=payload.model_dump(), headers=headers)


def _validation_code(error_type: str) -> str:
    if error_type == "missing":
        return "required"
    if error_type == "extra_forbidden":
        return "unexpected_field"
    if error_type == "json_invalid":
        return "invalid_json"
    if "uuid" in error_type:
        return "invalid_uuid"
    if "datetime" in error_type:
        return "invalid_datetime"
    if error_type.endswith("_type") or error_type.endswith("_parsing"):
        return "invalid_type"
    return "invalid_value"


async def validation_exception_handler(
    _request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    details: list[ErrorDetail] = []
    for error in exc.errors():
        location = [part for part in error.get("loc", ()) if isinstance(part, (str, int))]
        error_type = str(error.get("type", "invalid_value"))
        details.append(
            ErrorDetail(
                location=location,
                code=_validation_code(error_type),
                message=str(error.get("msg", "Invalid value.")),
            )
        )
    return error_response(
        status_code=422,
        code="validation_error",
        message="Request validation failed.",
        details=details,
    )


async def http_exception_handler(
    _request: Request,
    exc: StarletteHTTPException,
) -> JSONResponse:
    codes = {
        401: "authentication_required",
        403: "forbidden",
        404: "not_found",
        405: "method_not_allowed",
    }
    try:
        default_message = HTTPStatus(exc.status_code).phrase
    except ValueError:
        default_message = "HTTP error"
    message = exc.detail if isinstance(exc.detail, str) else default_message
    return error_response(
        status_code=exc.status_code,
        code=codes.get(exc.status_code, "http_error"),
        message=message,
        headers=exc.headers,
    )


async def unexpected_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception(
        "Unhandled application error",
        extra={"method": request.method, "path": request.url.path},
        exc_info=exc,
    )
    return error_response(
        status_code=500,
        code="internal_error",
        message="An unexpected server error occurred.",
    )


async def domain_exception_handler(_request: Request, exc: DomainError) -> JSONResponse:
    status_code = 400
    headers: dict[str, str] | None = None
    if isinstance(
        exc,
        (EmailAlreadyRegisteredError, AlreadyConnectedError, InvitationNotActiveError),
    ):
        status_code = 409
    elif isinstance(exc, (InvalidCredentialsError, AuthenticationRequiredError)):
        status_code = 401
        headers = {"WWW-Authenticate": "Bearer"}
    elif isinstance(exc, (ForbiddenError, CsrfValidationError)):
        status_code = 403
    elif isinstance(
        exc,
        (ProfileNotFoundError, InvitationNotFoundError, ConnectionNotFoundError),
    ):
        status_code = 404
    elif isinstance(exc, InvalidInvitationError):
        status_code = 400
    elif isinstance(exc, RateLimitExceededError):
        status_code = 429
        headers = {"Retry-After": str(exc.retry_after)}
    return error_response(
        status_code=status_code,
        code=exc.code,
        message=exc.safe_message,
        headers=headers,
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(DomainError, domain_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unexpected_exception_handler)

