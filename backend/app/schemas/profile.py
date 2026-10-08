from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.enums import UserRole


def _validate_timezone(value: str) -> str:
    normalized = value.strip()
    try:
        ZoneInfo(normalized)
    except ZoneInfoNotFoundError as exc:
        raise ValueError("Unknown IANA timezone.") from exc
    return normalized


class ProfileResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    first_name: str
    last_name: str
    email: EmailStr
    role: UserRole
    bio: str | None
    timezone: str


class ProfileUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    bio: str | None = Field(default=None, max_length=2000)
    timezone: str | None = Field(default=None, max_length=64)

    @field_validator("first_name", "last_name", mode="before")
    @classmethod
    def normalize_required_name(cls, value: object) -> object:
        if value is None:
            raise ValueError("Field must not be null.")
        return value.strip() if isinstance(value, str) else value

    @field_validator("bio", mode="before")
    @classmethod
    def normalize_bio(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("timezone", mode="before")
    @classmethod
    def validate_timezone(cls, value: object) -> object:
        if value is None:
            raise ValueError("Field must not be null.")
        return _validate_timezone(value) if isinstance(value, str) else value

