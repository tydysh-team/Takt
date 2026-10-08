from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.exceptions import (
    AuthenticationRequiredError,
    EmailAlreadyRegisteredError,
    InvalidCredentialsError,
    RefreshReplayError,
)
from app.core.security import AccessToken, PasswordService, TokenService, utc_now
from app.models.profile import Profile
from app.models.refresh_session import RefreshSession
from app.models.user import User
from app.repositories.refresh_sessions import RefreshSessionRepository
from app.repositories.users import UserRepository
from app.schemas.auth import LoginRequest, RegisterRequest


@dataclass(frozen=True, slots=True)
class RegistrationResult:
    user: User
    profile: Profile


@dataclass(frozen=True, slots=True)
class LoginResult:
    access_token: AccessToken
    refresh_token: str
    csrf_token: str


class AuthService:
    def __init__(
        self,
        *,
        session: AsyncSession,
        settings: Settings,
        passwords: PasswordService,
        tokens: TokenService,
    ) -> None:
        self._session = session
        self._settings = settings
        self._passwords = passwords
        self._tokens = tokens
        self._users = UserRepository(session)
        self._refresh_sessions = RefreshSessionRepository(session)

    async def register(self, payload: RegisterRequest) -> RegistrationResult:
        email = str(payload.email).strip().lower()
        raw_password = payload.password.get_secret_value()
        try:
            if await self._users.get_by_email(email) is not None:
                raise EmailAlreadyRegisteredError()

            user = User(
                email=email,
                password_hash=self._passwords.hash(raw_password),
                role=payload.role,
            )
            profile = Profile(
                first_name=payload.first_name,
                last_name=payload.last_name,
                timezone="UTC",
            )
            user.profile = profile
            self._users.add(user)
            await self._session.flush()
            await self._session.commit()
        except EmailAlreadyRegisteredError:
            await self._session.rollback()
            raise
        except IntegrityError as exc:
            await self._session.rollback()
            driver_error = getattr(exc.orig, "__cause__", None) or exc.orig
            if getattr(driver_error, "constraint_name", None) == "uq_users_email":
                raise EmailAlreadyRegisteredError() from exc
            raise
        except Exception:
            await self._session.rollback()
            raise
        return RegistrationResult(user=user, profile=profile)

    async def login(self, payload: LoginRequest) -> LoginResult:
        email = str(payload.email).strip().lower()
        raw_password = payload.password.get_secret_value()
        try:
            user = await self._users.get_by_email(email, for_update=True)
            if user is None:
                self._passwords.verify_dummy(raw_password)
                raise InvalidCredentialsError()
            if not self._passwords.verify(user.password_hash, raw_password):
                raise InvalidCredentialsError()
            if not user.is_active:
                raise InvalidCredentialsError()

            if self._passwords.needs_rehash(user.password_hash):
                user.password_hash = self._passwords.hash(raw_password)

            result = self._new_login_result(user)
            await self._session.commit()
        except InvalidCredentialsError:
            await self._session.rollback()
            raise
        except Exception:
            await self._session.rollback()
            raise
        return result

    async def refresh(self, raw_refresh_token: str) -> LoginResult:
        token_hash = self._tokens.digest_refresh_token(raw_refresh_token)
        now = utc_now()
        failure: AuthenticationRequiredError | None = None
        result: LoginResult | None = None

        try:
            refresh_session = await self._refresh_sessions.get_by_token_hash(
                token_hash,
                for_update=True,
            )
            if refresh_session is None:
                raise AuthenticationRequiredError()

            if refresh_session.revoked_at is not None:
                await self._refresh_sessions.revoke_family(refresh_session.family_id, now)
                failure = RefreshReplayError()
            elif refresh_session.expires_at <= now or not refresh_session.user.is_active:
                refresh_session.revoked_at = now
                refresh_session.last_used_at = now
                failure = AuthenticationRequiredError()
            else:
                refresh_session.revoked_at = now
                refresh_session.last_used_at = now
                result = self._new_login_result(
                    refresh_session.user,
                    family_id=refresh_session.family_id,
                    now=now,
                )
            await self._session.commit()
        except AuthenticationRequiredError:
            await self._session.rollback()
            raise
        except Exception:
            await self._session.rollback()
            raise

        if failure is not None:
            raise failure
        if result is None:
            raise AuthenticationRequiredError()
        return result

    async def logout(self, raw_refresh_token: str | None) -> None:
        if raw_refresh_token is None:
            return
        token_hash = self._tokens.digest_refresh_token(raw_refresh_token)
        now = utc_now()
        try:
            refresh_session = await self._refresh_sessions.get_by_token_hash(
                token_hash,
                for_update=True,
            )
            if refresh_session is not None and refresh_session.revoked_at is None:
                refresh_session.revoked_at = now
                refresh_session.last_used_at = now
            await self._session.commit()
        except Exception:
            await self._session.rollback()
            raise

    def _new_login_result(
        self,
        user: User,
        *,
        family_id: UUID | None = None,
        now: datetime | None = None,
    ) -> LoginResult:
        current_time = now or utc_now()
        session_family_id = family_id or uuid4()
        raw_refresh_token = self._tokens.generate_refresh_token()
        refresh_session = RefreshSession(
            user_id=user.id,
            token_hash=self._tokens.digest_refresh_token(raw_refresh_token),
            family_id=session_family_id,
            created_at=current_time,
            last_used_at=current_time,
            expires_at=current_time + timedelta(days=self._settings.refresh_token_ttl_days),
        )
        self._refresh_sessions.add(refresh_session)
        return LoginResult(
            access_token=self._tokens.create_access_token(
                user_id=user.id,
                role=user.role,
                now=current_time,
            ),
            refresh_token=raw_refresh_token,
            csrf_token=self._tokens.generate_csrf_token(),
        )

