from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, field_validator

from app.models.enums import UserRole


def _normalize_email(value: object) -> object:
    if isinstance(value, str):
        return value.strip().lower()
    return value


def _validate_password(value: object) -> object:
    raw_value = value.get_secret_value() if isinstance(value, SecretStr) else value
    if not isinstance(raw_value, str):
        return value
    requirements = (
        (len(raw_value) >= 10, "Password must contain at least 10 characters."),
        (any(character.islower() for character in raw_value), "Password needs a lowercase letter."),
        (
            any(character.isupper() for character in raw_value),
            "Password needs an uppercase letter.",
        ),
        (any(character.isdigit() for character in raw_value), "Password needs a digit."),
        (
            any(not character.isalnum() for character in raw_value),
            "Password needs a special character.",
        ),
    )
    for valid, message in requirements:
        if not valid:
            raise ValueError(message)
    return value


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: SecretStr
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    role: Literal[UserRole.TEACHER, UserRole.STUDENT]

    _email_normalizer = field_validator("email", mode="before")(_normalize_email)
    _password_policy = field_validator("password", mode="before")(_validate_password)

    @field_validator("first_name", "last_name", mode="before")
    @classmethod
    def normalize_name(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class RegisterResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: UUID
    email: EmailStr
    role: UserRole
    first_name: str
    last_name: str
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
    role: UserRole
    first_name: str
    last_name: str

