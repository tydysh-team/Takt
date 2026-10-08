import logging
from collections.abc import Mapping
from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.schemas.error import ErrorDetail, ErrorResponse

logger = logging.getLogger(__name__)


def _response(
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
    return _response(
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
    return _response(
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
    return _response(
        status_code=500,
        code="internal_error",
        message="An unexpected server error occurred.",
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(RequestValidationError, validation_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unexpected_exception_handler)

