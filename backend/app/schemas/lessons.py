from datetime import datetime
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator


class LessonCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    student_id: UUID
    title: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    starts_at: AwareDatetime

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
