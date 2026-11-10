from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.homework import HomeworkStatus


class HomeworkCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    student_id: UUID
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=10000)
    due_at: datetime

    @field_validator("title")
    @classmethod
    def trim_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Title is required")
        return value

    @field_validator("due_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Deadline must include a timezone")
        return value


class HomeworkAttachmentDTO(BaseModel):
    id: UUID
    original_name: str
    mime_type: str
    size_bytes: int
    sha256: str
    created_at: datetime


class HomeworkDTO(BaseModel):
    id: UUID
    teacher_id: UUID
    teacher_name: str
    student_id: UUID
    student_name: str
    title: str
    description: str | None
    due_at: datetime
    status: HomeworkStatus
    is_overdue: bool
    created_at: datetime
    attachments: list[HomeworkAttachmentDTO]


class HomeworkPage(BaseModel):
    items: list[HomeworkDTO]
    total: int
    limit: int
    offset: int
