"""TOTP enrollment and single-use second-factor verification."""

import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID

import pyotp
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.exceptions import (
    AuthenticationRequiredError,
    CurrentPasswordInvalidError,
    MfaAlreadyEnabledError,
    MfaChallengeInvalidError,
    MfaConfigurationError,
    MfaInvalidCodeError,
    MfaNotEnabledError,
    MfaSetupExpiredError,
)
from app.core.security import PasswordService, utc_now
from app.models.mfa import MfaBackupCode, MfaChallenge, UserTotp
from app.models.user import User
from app.repositories.refresh_sessions import RefreshSessionRepository
from app.repositories.users import UserRepository


@dataclass(frozen=True, slots=True)
class MfaChallengeResult:
    challenge: str
    expires_in: int = 300


@dataclass(frozen=True, slots=True)
class MfaSetupResult:
    secret: str
    provisioning_uri: str
    expires_in: int = 600


class MfaService:
    def __init__(self, session: AsyncSession, settings: Settings, passwords: PasswordService):
        self._session = session
        self._settings = settings
        self._passwords = passwords
        self._users = UserRepository(session)
        self._refresh = RefreshSessionRepository(session)

    def _fernet(self) -> Fernet:
        key = self._settings.totp_encryption_key
        if key is None:
            raise MfaConfigurationError()
        try:
            return Fernet(key.get_secret_value().encode())
        except (ValueError, TypeError) as exc:
            raise MfaConfigurationError() from exc

    def _digest(self, purpose: bytes, value: str, user_id: UUID | None = None) -> str:
        key = self._settings.mfa_backup_hmac_key
        if key is None:
            raise MfaConfigurationError()
        material = purpose + (user_id.bytes if user_id is not None else b"") + value.encode()
        return hmac.new(key.get_secret_value().encode(), material, hashlib.sha256).hexdigest()

    def _decrypt(self, encrypted: str) -> str:
        try:
            return self._fernet().decrypt(encrypted.encode()).decode()
        except (InvalidToken, UnicodeDecodeError) as exc:
            raise MfaConfigurationError() from exc

    async def _state(self, user_id: UUID, *, lock: bool = False) -> UserTotp | None:
        query = select(UserTotp).where(UserTotp.user_id == user_id)
        if lock:
            query = query.with_for_update()
        return await self._session.scalar(query)

    async def _locked_user(self, user_id: UUID) -> User:
        user = await self._users.get_by_id(user_id, for_update=True)
        if user is None or not user.is_active:
            raise AuthenticationRequiredError()
        return user

    def _verify_password(self, user: User, password: str) -> None:
        if not self._passwords.verify(user.password_hash, password):
            raise CurrentPasswordInvalidError()

    async def is_enabled(self, user_id: UUID) -> bool:
        state = await self._state(user_id)
        return state is not None and state.enabled_at is not None

    def create_challenge(self, user_id: UUID) -> MfaChallengeResult:
        # A broken/missing key must never make an MFA account fall back to password-only.
        self._fernet()
        self._digest(b"configuration-check:", "")
        raw = secrets.token_urlsafe(48)
        self._session.add(
            MfaChallenge(
                user_id=user_id,
                token_digest=self._digest(b"challenge:", raw),
                expires_at=utc_now() + timedelta(minutes=5),
                attempts=0,
            )
        )
        return MfaChallengeResult(challenge=raw)

    async def status(self, user_id: UUID) -> bool:
        return await self.is_enabled(user_id)

    async def start_setup(self, user_id: UUID, password: str) -> MfaSetupResult:
        try:
            user = await self._locked_user(user_id)
            self._verify_password(user, password)
            state = await self._state(user_id, lock=True)
            if state is not None and state.enabled_at is not None:
                raise MfaAlreadyEnabledError()
            self._digest(b"configuration-check:", "")
            secret = pyotp.random_base32()
            now = utc_now()
            if state is None:
                state = UserTotp(user_id=user_id)
                self._session.add(state)
            state.pending_secret = self._fernet().encrypt(secret.encode()).decode()
            state.pending_expires_at = now + timedelta(minutes=10)
            uri = pyotp.TOTP(secret, digits=6, interval=30).provisioning_uri(
                name=user.email, issuer_name="Takt"
            )
            await self._session.commit()
            return MfaSetupResult(secret=secret, provisioning_uri=uri)
        except Exception:
            await self._session.rollback()
            raise

    async def confirm_setup(self, user_id: UUID, code: str) -> list[str]:
        try:
            await self._locked_user(user_id)
            state = await self._state(user_id, lock=True)
            if state is None or state.pending_secret is None or state.pending_expires_at is None:
                raise MfaSetupExpiredError()
            now = utc_now()
            if state.pending_expires_at <= now:
                state.pending_secret = None
                state.pending_expires_at = None
                await self._session.commit()
                raise MfaSetupExpiredError()
            if state.enabled_at is not None:
                raise MfaAlreadyEnabledError()
            secret = self._decrypt(state.pending_secret)
            if not self._verify_totp(secret, code, state, now):
                raise MfaInvalidCodeError()
            state.encrypted_secret = state.pending_secret
            state.pending_secret = None
            state.pending_expires_at = None
            state.enabled_at = now
            codes = await self._replace_backup_codes(user_id)
            await self._refresh.revoke_user(user_id, now)
            await self._session.commit()
            return codes
        except MfaSetupExpiredError:
            # Preserve removal of an expired pending setup.
            raise
        except Exception:
            await self._session.rollback()
            raise

    async def verify_challenge(self, raw_challenge: str, code: str) -> User:
        digest = self._digest(b"challenge:", raw_challenge)
        challenge = await self._session.scalar(
            select(MfaChallenge).where(MfaChallenge.token_digest == digest)
        )
        if challenge is None:
            raise MfaChallengeInvalidError()
        user = await self._locked_user(challenge.user_id)
        challenge = await self._session.scalar(
            select(MfaChallenge).where(MfaChallenge.id == challenge.id).with_for_update()
        )
        now = utc_now()
        if (
            challenge is None
            or challenge.consumed_at is not None
            or challenge.expires_at <= now
            or challenge.attempts >= 5
        ):
            raise MfaChallengeInvalidError()
        state = await self._state(user.id, lock=True)
        if state is None or state.enabled_at is None:
            raise MfaChallengeInvalidError()
        if not await self._verify_code(user.id, state, code, now):
            challenge.attempts += 1
            await self._session.commit()
            raise MfaInvalidCodeError()
        challenge.consumed_at = now
        return user

    async def disable(self, user_id: UUID, password: str, code: str) -> None:
        try:
            user = await self._locked_user(user_id)
            self._verify_password(user, password)
            state = await self._state(user_id, lock=True)
            if state is None or state.enabled_at is None:
                raise MfaNotEnabledError()
            now = utc_now()
            if not await self._verify_code(user_id, state, code, now):
                raise MfaInvalidCodeError()
            await self._session.execute(
                delete(MfaBackupCode).where(MfaBackupCode.user_id == user_id)
            )
            await self._session.execute(delete(MfaChallenge).where(MfaChallenge.user_id == user_id))
            await self._session.delete(state)
            await self._refresh.revoke_user(user_id, now)
            await self._session.commit()
        except Exception:
            await self._session.rollback()
            raise

    async def regenerate(self, user_id: UUID, password: str, code: str) -> list[str]:
        try:
            user = await self._locked_user(user_id)
            self._verify_password(user, password)
            state = await self._state(user_id, lock=True)
            if state is None or state.enabled_at is None:
                raise MfaNotEnabledError()
            if not await self._verify_code(user_id, state, code, utc_now()):
                raise MfaInvalidCodeError()
            codes = await self._replace_backup_codes(user_id)
            await self._session.commit()
            return codes
        except Exception:
            await self._session.rollback()
            raise

    async def _replace_backup_codes(self, user_id: UUID) -> list[str]:
        await self._session.execute(delete(MfaBackupCode).where(MfaBackupCode.user_id == user_id))
        codes = [secrets.token_hex(12).upper() for _ in range(10)]
        for code in codes:
            self._session.add(
                MfaBackupCode(user_id=user_id, code_digest=self._digest(b"backup:", code, user_id))
            )
        return codes

    async def _verify_code(self, user_id: UUID, state: UserTotp, code: str, now: datetime) -> bool:
        if state.encrypted_secret is None:
            return False
        if len(code) == 6 and code.isascii() and code.isdecimal():
            secret = self._decrypt(state.encrypted_secret)
            return self._verify_totp(secret, code, state, now)
        normalized = code.strip().replace("-", "").upper()
        if len(normalized) != 24 or any(char not in "0123456789ABCDEF" for char in normalized):
            return False
        digest = self._digest(b"backup:", normalized, user_id)
        backup = await self._session.scalar(
            select(MfaBackupCode)
            .where(
                MfaBackupCode.user_id == user_id,
                MfaBackupCode.code_digest == digest,
                MfaBackupCode.consumed_at.is_(None),
            )
            .with_for_update()
        )
        if backup is None:
            return False
        backup.consumed_at = now
        return True

    @staticmethod
    def _verify_totp(secret: str, code: str, state: UserTotp, now: datetime) -> bool:
        if len(code) != 6 or not code.isascii() or not code.isdecimal():
            return False
        step = int(now.timestamp()) // 30
        totp = pyotp.TOTP(secret, digits=6, interval=30, digest=hashlib.sha1)
        for candidate in (step, step - 1, step + 1):
            if state.last_used_step is not None and candidate <= state.last_used_step:
                continue
            if hmac.compare_digest(totp.at(candidate * 30), code):
                state.last_used_step = candidate
                return True
        return False
