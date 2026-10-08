from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.exceptions import (
    AuthenticationRequiredError,
    CsrfValidationError,
    ForbiddenError,
    RateLimitExceededError,
)
from app.core.rate_limit import InMemoryRateLimiter, RateLimiter, RateLimitKeyFactory
from app.core.security import PasswordService, TokenService
from app.db.session import get_db_session
from app.models.user import User
from app.repositories.users import UserRepository
from app.services.auth import AuthService
from app.services.profiles import ProfileService

bearer_scheme = HTTPBearer(auto_error=False)


@lru_cache
def get_password_service() -> PasswordService:
    return PasswordService()


def get_token_service(settings: Annotated[Settings, Depends(get_settings)]) -> TokenService:
    return TokenService(settings)


@lru_cache
def get_rate_limiter() -> InMemoryRateLimiter:
    return InMemoryRateLimiter()


def get_auth_service(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    passwords: Annotated[PasswordService, Depends(get_password_service)],
    tokens: Annotated[TokenService, Depends(get_token_service)],
) -> AuthService:
    return AuthService(
        session=session,
        settings=settings,
        passwords=passwords,
        tokens=tokens,
    )


def get_profile_service(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ProfileService:
    return ProfileService(session)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    tokens: Annotated[TokenService, Depends(get_token_service)],
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AuthenticationRequiredError()
    claims = tokens.decode_access_token(credentials.credentials)
    user = await UserRepository(session).get_by_id(claims.user_id)
    if user is None or user.role != claims.role:
        raise AuthenticationRequiredError()
    return user


async def get_current_active_user(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    if not user.is_active:
        raise ForbiddenError()
    return user


def validate_csrf(request: Request, settings: Settings, tokens: TokenService) -> None:
    cookie_value = request.cookies.get(settings.csrf_cookie_name)
    header_value = request.headers.get(settings.csrf_header_name)
    if (
        cookie_value is None
        or header_value is None
        or not tokens.csrf_matches(cookie_value, header_value)
    ):
        raise CsrfValidationError()


async def enforce_rate_limit(
    *,
    request: Request,
    scope: str,
    limit: int,
    settings: Settings,
    limiter: RateLimiter,
) -> None:
    client_ip = request.client.host if request.client is not None else "unknown"
    subject_key = RateLimitKeyFactory(
        settings.rate_limit_hmac_key.get_secret_value()
    ).for_ip(client_ip)
    result = await limiter.check(
        scope=scope,
        subject_key=subject_key,
        limit=limit,
        window_seconds=settings.rate_limit_window_seconds,
    )
    if not result.allowed:
        raise RateLimitExceededError(retry_after=result.retry_after)

