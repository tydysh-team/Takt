from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.timezones import validate_timezone
from app.models.enums import RoleCode


class ProfileResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    first_name: str
    last_name: str
    middle_name: str | None
    email: EmailStr
    role: RoleCode
    bio: str | None
    timezone: str


class ProfileUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    bio: str | None = Field(default=None, max_length=2000)
    timezone: str | None = Field(default=None, max_length=64)

    @field_validator("first_name", "last_name", mode="before")
    @classmethod
    def normalize_required_name(cls, value: object) -> object:
        if value is None:
            raise ValueError("Field must not be null.")
        return value.strip() if isinstance(value, str) else value

    @field_validator("middle_name", mode="before")
    @classmethod
    def normalize_middle_name(cls, value: object) -> object:
        return value.strip() or None if isinstance(value, str) else value

    @field_validator("bio", mode="before")
    @classmethod
    def normalize_bio(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("timezone", mode="before")
    @classmethod
    def validate_timezone(cls, value: object) -> object:
        if value is None:
            raise ValueError("Field must not be null.")
        return validate_timezone(value) if isinstance(value, str) else value

