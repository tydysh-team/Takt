from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import cast
from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.homework import Homework, HomeworkReview, HomeworkSubmission, ReviewDecision


@dataclass(frozen=True, slots=True)
class ReviewStatisticsCounts:
    graded_homework: int
    average_grade: float | None


class ReviewStatisticsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def for_student(
        self, teacher_id: UUID | None, student_id: UUID, date_from: datetime, date_to: datetime
    ) -> ReviewStatisticsCounts:
        # The latest attempt determines the final result. An unreviewed attempt or
        # needs_revision decision has no applicable numeric grade.
        final_grade = (
            select(case((HomeworkReview.decision == ReviewDecision.ACCEPTED, HomeworkReview.grade)))
            .select_from(HomeworkSubmission)
            .outerjoin(HomeworkReview, HomeworkReview.submission_id == HomeworkSubmission.id)
            .where(HomeworkSubmission.homework_id == Homework.id)
            .order_by(HomeworkSubmission.attempt_no.desc())
            .limit(1)
            .correlate(Homework)
            .scalar_subquery()
        )
        cohort = select(final_grade.label("grade")).where(
            Homework.student_id == student_id,
            Homework.created_at >= date_from,
            Homework.created_at < date_to,
        )
        if teacher_id is not None:
            cohort = cohort.where(Homework.teacher_id == teacher_id)
        grades = cohort.subquery()
        row = (
            await self._session.execute(
                select(func.count(grades.c.grade), func.avg(grades.c.grade))
            )
        ).one()
        average = cast(Decimal | None, row[1])
        return ReviewStatisticsCounts(
            graded_homework=cast(int, row[0]),
            average_grade=round(float(average), 2) if average is not None else None,
        )
