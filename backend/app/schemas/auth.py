from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, field_validator

from app.core.timezones import DEFAULT_TIMEZONE, validate_timezone
from app.models.enums import RoleCode


def _normalize_email(value: object) -> object:
    if isinstance(value, str):
        return value.strip().lower()
    return value


def _validate_password(value: object) -> object:
    raw_value = value.get_secret_value() if isinstance(value, SecretStr) else value
    if not isinstance(raw_value, str):
        return value
    if not 8 <= len(raw_value) <= 128:
        raise ValueError("Password must contain between 8 and 128 characters.")
    return value


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: SecretStr
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    role: Literal[RoleCode.TEACHER, RoleCode.STUDENT]
    timezone: str = Field(default=DEFAULT_TIMEZONE, max_length=64)

    _email_normalizer = field_validator("email", mode="before")(_normalize_email)
    _password_policy = field_validator("password", mode="before")(_validate_password)
    _timezone_validator = field_validator("timezone")(validate_timezone)

    @field_validator("first_name", "last_name", mode="before")
    @classmethod
    def normalize_name(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("middle_name", mode="before")
    @classmethod
    def normalize_middle_name(cls, value: object) -> object:
        return value.strip() or None if isinstance(value, str) else value

class RegisterResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: UUID
    email: EmailStr
    role: RoleCode
    first_name: str
    last_name: str
    middle_name: str | None
    created_at: datetime


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: SecretStr

    _email_normalizer = field_validator("email", mode="before")(_normalize_email)


class AccessTokenResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int


class CurrentUserResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    email: EmailStr
    role: RoleCode
    first_name: str
    last_name: str
    middle_name: str | None

