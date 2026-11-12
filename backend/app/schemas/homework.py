from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.homework import HomeworkStatus, ReviewDecision


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


class HomeworkSubmissionDTO(BaseModel):
    id: UUID
    homework_id: UUID
    attempt_no: int
    comment: str | None
    submitted_at: datetime
    is_late: bool
    attachments: list[HomeworkAttachmentDTO]
    review: "HomeworkReviewDTO | None" = None


class HomeworkReviewDTO(BaseModel):
    id: UUID
    decision: ReviewDecision
    grade: int | None
    comment: str | None
    reviewed_at: datetime


class HomeworkReviewCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    grade: int = Field(ge=0, le=100)
    comment: str | None = Field(default=None, max_length=10000)


class HomeworkRevisionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    comment: str = Field(min_length=1, max_length=10000)

    @field_validator("comment")
    @classmethod
    def require_comment(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Comment is required")
        return value


class HomeworkSubmissionResult(BaseModel):
    submission: HomeworkSubmissionDTO
    homework: "HomeworkDTO"


class PendingSubmissionDTO(HomeworkSubmissionDTO):
    student_id: UUID
    student_name: str
    title: str
    due_at: datetime
    homework_status: HomeworkStatus


class PendingSubmissionPage(BaseModel):
    items: list[PendingSubmissionDTO]
    total: int
    limit: int
    offset: int


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
    latest_submission: HomeworkSubmissionDTO | None = None


class HomeworkPage(BaseModel):
    items: list[HomeworkDTO]
    total: int
    limit: int
    offset: int
