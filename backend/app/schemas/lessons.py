from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from app.models.enums import AttendanceStatus, LessonStatus
from app.schemas.connections import StudentRefDTO


class LessonCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    student_id: UUID
    title: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    starts_at: AwareDatetime
    duration_minutes: int = Field(strict=True, gt=0, le=2147483647)
    confirm_conflict: bool = False

    @field_validator("title", mode="before")
    @classmethod
    def normalize_title(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class LessonDTO(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: UUID
    teacher_id: UUID
    student_id: UUID
    title: str
    description: str | None
    starts_at: datetime
    ends_at: datetime
    duration_minutes: int
    status: LessonStatus
    is_rescheduled: bool
    attendance: AttendanceStatus
    cancellation_reason: str | None


class LessonRescheduleRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    starts_at: AwareDatetime
    confirm_conflict: bool = False


class LessonCancelRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str | None = Field(default=None, max_length=500)

    @field_validator("reason", mode="before")
    @classmethod
    def normalize_reason(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value


class LessonAttendanceUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    attendance: Literal["present", "absent"]


class LessonConflictDTO(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    title: str
    starts_at: datetime
    ends_at: datetime
    duration_minutes: int
    student: StudentRefDTO


class LessonSearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date_from: AwareDatetime | None = None
    date_to: AwareDatetime | None = None

    @model_validator(mode="after")
    def validate_range(self) -> "LessonSearchRequest":
        if (
            self.date_from is not None
            and self.date_to is not None
            and self.date_from >= self.date_to
        ):
            raise ValueError("date_from must be earlier than date_to")
        return self


class LessonReadDTO(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    title: str
    description: str | None
    starts_at: datetime
    ends_at: datetime
    duration_minutes: int
    status: LessonStatus
    is_rescheduled: bool
    attendance: AttendanceStatus
    cancellation_reason: str | None
    teacher: StudentRefDTO
    student: StudentRefDTO
