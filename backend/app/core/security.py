import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from argon2.low_level import Type
from jwt import InvalidTokenError

from app.core.config import Settings
from app.core.exceptions import AuthenticationRequiredError
from app.models.enums import RoleCode


def utc_now() -> datetime:
    return datetime.now(UTC)


class PasswordService:
    """Argon2id password hashing with a reusable dummy verification target."""

    def __init__(self) -> None:
        self._hasher = PasswordHasher(
            time_cost=3,
            memory_cost=65_536,
            parallelism=4,
            hash_len=32,
            salt_len=16,
            type=Type.ID,
        )
        self._dummy_hash = self._hasher.hash(secrets.token_urlsafe(32))

    def hash(self, password: str) -> str:
        return self._hasher.hash(password)

    def verify(self, password_hash: str, password: str) -> bool:
        try:
            return self._hasher.verify(password_hash, password)
        except VerificationError:
            return False

    def verify_dummy(self, password: str) -> None:
        self.verify(self._dummy_hash, password)

    def needs_rehash(self, password_hash: str) -> bool:
        return self._hasher.check_needs_rehash(password_hash)


@dataclass(frozen=True, slots=True)
class AccessToken:
    value: str
    expires_at: datetime


@dataclass(frozen=True, slots=True)
class AccessTokenClaims:
    user_id: UUID
    role: RoleCode
    token_id: UUID


class TokenService:
    def __init__(self, settings: Settings) -> None:
        self._jwt_key = settings.jwt_secret_key.get_secret_value()
        self._refresh_hmac_key = settings.refresh_token_hmac_key.get_secret_value().encode()
        self._algorithm = settings.jwt_algorithm
        self._issuer = settings.jwt_issuer
        self._audience = settings.jwt_audience
        self._access_ttl = timedelta(minutes=settings.access_token_ttl_minutes)

    def create_access_token(
        self,
        *,
        user_id: UUID,
        role: RoleCode,
        now: datetime | None = None,
    ) -> AccessToken:
        issued_at = now or utc_now()
        expires_at = issued_at + self._access_ttl
        token_id = uuid4()
        claims = {
            "sub": str(user_id),
            "role": role.value,
            "type": "access",
            "jti": str(token_id),
            "iat": issued_at,
            "exp": expires_at,
            "iss": self._issuer,
            "aud": self._audience,
        }
        value = jwt.encode(claims, self._jwt_key, algorithm=self._algorithm)
        return AccessToken(value=value, expires_at=expires_at)

    def decode_access_token(self, token: str) -> AccessTokenClaims:
        try:
            claims = jwt.decode(
                token,
                self._jwt_key,
                algorithms=[self._algorithm],
                audience=self._audience,
                issuer=self._issuer,
                options={
                    "require": ["sub", "role", "type", "jti", "iat", "exp", "iss", "aud"]
                },
            )
            if claims.get("type") != "access":
                raise AuthenticationRequiredError()
            user_id = UUID(str(claims["sub"]))
            raw_role = claims["role"]
            if not isinstance(raw_role, str):
                raise AuthenticationRequiredError()
            role = RoleCode(raw_role)
            token_id = UUID(str(claims["jti"]))
        except (InvalidTokenError, KeyError, TypeError, ValueError) as exc:
            raise AuthenticationRequiredError() from exc
        return AccessTokenClaims(user_id=user_id, role=role, token_id=token_id)

    @staticmethod
    def generate_refresh_token() -> str:
        return secrets.token_urlsafe(48)

    def digest_refresh_token(self, raw_token: str) -> str:
        return hmac.new(
            self._refresh_hmac_key,
            raw_token.encode(),
            hashlib.sha256,
        ).hexdigest()

    @staticmethod
    def generate_csrf_token() -> str:
        return secrets.token_urlsafe(32)

    @staticmethod
    def csrf_matches(cookie_value: str, header_value: str) -> bool:
        return hmac.compare_digest(cookie_value.encode(), header_value.encode())

