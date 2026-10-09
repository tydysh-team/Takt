from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.enums import RelationStatus


class StudentListItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    first_name: str
    last_name: str
    email: EmailStr
    timezone: str
    connected_at: datetime
    status: RelationStatus


class StudentConnection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: RelationStatus
    connected_at: datetime
    teacher_note: str | None


class StudentDetailResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    first_name: str
    last_name: str
    email: EmailStr
    timezone: str
    connection: StudentConnection


class TeacherNoteUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    note: str | None = Field(default=None, max_length=2000)

    @field_validator("note", mode="before")
    @classmethod
    def normalize_note(cls, value: object) -> object:
        if isinstance(value, str):
            normalized = value.strip()
            return normalized or None
        return value


class TeacherListItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    first_name: str
    last_name: str
    email: EmailStr
    timezone: str
    connected_at: datetime


class ConnectionAcceptedResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    teacher: TeacherListItem
