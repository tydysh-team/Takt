from datetime import datetime
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, model_validator


class HomeworkStatisticsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date_from: AwareDatetime
    date_to: AwareDatetime

    @model_validator(mode="after")
    def validate_range(self) -> "HomeworkStatisticsRequest":
        if self.date_from >= self.date_to:
            raise ValueError("date_from must be earlier than date_to")
        return self


class HomeworkStatisticsDTO(BaseModel):
    assigned: int
    submitted: int
    reviewed: int
    late: int
    revision_required: int
    completion_rate: float | None


class HomeworkStatisticsResponse(BaseModel):
    student_id: UUID
    date_from: datetime
    date_to: datetime
    statistics: HomeworkStatisticsDTO
