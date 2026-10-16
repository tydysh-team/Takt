from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class InvitationStatus(StrEnum):
    ACTIVE = "ACTIVE"
    USED = "USED"
    REVOKED = "REVOKED"
    EXPIRED = "EXPIRED"


class InvitationCreateResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    code: str
    created_at: datetime
    expires_at: datetime


class InvitationListItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    created_at: datetime
    expires_at: datetime
    used_at: datetime | None
    revoked_at: datetime | None
    status: InvitationStatus


class InvitationAcceptRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, max_length=64)

    @field_validator("code", mode="before")
    @classmethod
    def strip_code(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value
