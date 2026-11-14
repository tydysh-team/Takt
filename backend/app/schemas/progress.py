from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.schemas.homework_statistics import HomeworkStatisticsDTO
from app.schemas.lessons import LessonHistoryAggregatesDTO


class ReviewStatisticsDTO(BaseModel):
    model_config = ConfigDict(extra="forbid")

    graded_homework: int
    average_grade: float | None


class ProgressResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    student_id: UUID
    date_from: datetime
    date_to: datetime
    attendance: LessonHistoryAggregatesDTO
    homework: HomeworkStatisticsDTO
    reviews: ReviewStatisticsDTO
