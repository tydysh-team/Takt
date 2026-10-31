from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import JSONResponse

from app.api.cookies import clear_auth_cookies, set_auth_cookies
from app.api.dependencies.auth import (
    enforce_rate_limit,
    get_auth_service,
    get_current_active_user,
    get_rate_limiter,
    get_token_service,
    validate_csrf,
)
from app.core.config import Settings, get_settings
from app.core.errors import error_response
from app.core.exceptions import AuthenticationRequiredError, RateLimitExceededError
from app.core.rate_limit import RateLimiter, RateLimitKeyFactory
from app.core.security import TokenService
from app.models.user import User
from app.schemas.auth import (
    AccessTokenResponse,
    ChangePasswordRequest,
    LoginRequest,
    RegisterRequest,
    RegisterResponse,
)
from app.schemas.error import ErrorResponse
from app.services.auth import AuthService, LoginResult

router = APIRouter(prefix="/auth", tags=["Authentication"])

common_auth_errors: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse, "description": "Authentication failed"},
    422: {"model": ErrorResponse, "description": "Request validation failed"},
    429: {"model": ErrorResponse, "description": "Rate limit exceeded"},
}


def _token_response(result: LoginResult, settings: Settings) -> AccessTokenResponse:
    return AccessTokenResponse(
        access_token=result.access_token.value,
        expires_in=settings.access_token_ttl_minutes * 60,
    )


@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a teacher or student",
    description="Creates a User and Profile atomically. Registration does not log the user in.",
    responses={
        409: {"model": ErrorResponse, "description": "Email is already registered"},
        422: {"model": ErrorResponse, "description": "Request validation failed"},
        429: {"model": ErrorResponse, "description": "Rate limit exceeded"},
    },
)
async def register(
    payload: RegisterRequest,
    request: Request,
    service: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    limiter: Annotated[RateLimiter, Depends(get_rate_limiter)],
) -> RegisterResponse:
    await enforce_rate_limit(
        request=request,
        scope="auth:register",
        limit=settings.register_rate_limit,
        settings=settings,
        limiter=limiter,
    )
    result = await service.register(payload)
    return RegisterResponse(
        id=result.user.id,
        email=result.user.email,
        role=result.user.role,
        first_name=result.profile.first_name,
        last_name=result.profile.last_name,
        middle_name=result.profile.middle_name,
        created_at=result.user.created_at,
    )


@router.post(
    "/login",
    response_model=AccessTokenResponse,
    summary="Create an authenticated session",
    description="Returns a short-lived access JWT and sets rotating refresh and CSRF cookies.",
    responses=common_auth_errors,
)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    service: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    limiter: Annotated[RateLimiter, Depends(get_rate_limiter)],
) -> AccessTokenResponse:
    await enforce_rate_limit(
        request=request,
        scope="auth:login",
        limit=settings.login_rate_limit,
        settings=settings,
        limiter=limiter,
    )
    result = await service.login(payload)
    set_auth_cookies(
        response,
        refresh_token=result.refresh_token,
        csrf_token=result.csrf_token,
        settings=settings,
    )
    return _token_response(result, settings)


@router.post(
    "/refresh",
    response_model=AccessTokenResponse,
    summary="Rotate the refresh session",
    description="Consumes the current refresh token once and rotates it within its session family.",
    responses={
        401: {"model": ErrorResponse, "description": "Refresh session is invalid"},
        403: {"model": ErrorResponse, "description": "CSRF validation failed"},
    },
)
async def refresh(
    request: Request,
    response: Response,
    service: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    tokens: Annotated[TokenService, Depends(get_token_service)],
) -> AccessTokenResponse | JSONResponse:
    validate_csrf(request, settings, tokens)
    raw_refresh_token = request.cookies.get(settings.refresh_cookie_name)
    try:
        if raw_refresh_token is None:
            raise AuthenticationRequiredError()
        result = await service.refresh(raw_refresh_token)
    except AuthenticationRequiredError as exc:
        failure_response = error_response(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code=exc.code,
            message=exc.safe_message,
            headers={"WWW-Authenticate": "Bearer"},
        )
        clear_auth_cookies(failure_response, settings)
        return failure_response

    set_auth_cookies(
        response,
        refresh_token=result.refresh_token,
        csrf_token=result.csrf_token,
        settings=settings,
    )
    return _token_response(result, settings)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke the current refresh session",
    description="Revokes the server-side refresh session and clears both auth cookies.",
    responses={403: {"model": ErrorResponse, "description": "CSRF validation failed"}},
)
async def logout(
    request: Request,
    service: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    tokens: Annotated[TokenService, Depends(get_token_service)],
) -> Response:
    validate_csrf(request, settings, tokens)
    await service.logout(request.cookies.get(settings.refresh_cookie_name))
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_auth_cookies(response, settings)
    return response


@router.post(
    "/change-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Change the current user's password",
    description="Requires an access JWT and CSRF token; revokes all refresh sessions on success.",
    responses={
        400: {"model": ErrorResponse, "description": "Current password is incorrect"},
        401: {"model": ErrorResponse, "description": "Authentication required"},
        403: {"model": ErrorResponse, "description": "CSRF validation failed"},
        409: {"model": ErrorResponse, "description": "Password is unchanged"},
        422: {"model": ErrorResponse, "description": "Request validation failed"},
        429: {"model": ErrorResponse, "description": "Rate limit exceeded"},
    },
)
async def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    user: Annotated[User, Depends(get_current_active_user)],
    service: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    tokens: Annotated[TokenService, Depends(get_token_service)],
    limiter: Annotated[RateLimiter, Depends(get_rate_limiter)],
) -> Response:
    validate_csrf(request, settings, tokens)
    await enforce_rate_limit(
        request=request,
        scope="auth:change-password:ip",
        limit=settings.login_rate_limit,
        settings=settings,
        limiter=limiter,
    )
    user_limit = await limiter.check(
        scope="auth:change-password:user",
        subject_key=RateLimitKeyFactory(
            settings.rate_limit_hmac_key.get_secret_value()
        ).for_user(str(user.id)),
        limit=settings.login_rate_limit,
        window_seconds=settings.rate_limit_window_seconds,
    )
    if not user_limit.allowed:
        raise RateLimitExceededError(retry_after=user_limit.retry_after)
    await service.change_password(user.id, payload)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_auth_cookies(response, settings)
    return response

