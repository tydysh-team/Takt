from datetime import datetime
from uuid import UUID

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from app.schemas.connections import StudentRefDTO


class LessonCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    student_id: UUID
    title: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    starts_at: AwareDatetime
    duration_minutes: int = Field(strict=True, gt=0, le=2147483647)

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
    duration_minutes: int


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
    duration_minutes: int
    teacher: StudentRefDTO
    student: StudentRefDTO
