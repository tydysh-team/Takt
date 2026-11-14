from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.homework import Homework, HomeworkReview, HomeworkSubmission, ReviewDecision


@dataclass(frozen=True, slots=True)
class HomeworkStatisticsCounts:
    assigned: int
    submitted: int
    reviewed: int
    late: int
    revision_required: int


class HomeworkStatisticsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def count_for_student(
        self, teacher_id: UUID, student_id: UUID, date_from: datetime, date_to: datetime
    ) -> HomeworkStatisticsCounts:
        # Each EXISTS is correlated to one Homework, so retries and review history cannot
        # multiply a count. Submission/review timestamps are intentionally unrestricted.
        submitted = (
            select(HomeworkSubmission.id)
            .where(HomeworkSubmission.homework_id == Homework.id)
            .exists()
        )
        accepted = (
            select(HomeworkReview.id)
            .join(HomeworkSubmission, HomeworkSubmission.id == HomeworkReview.submission_id)
            .where(
                HomeworkSubmission.homework_id == Homework.id,
                HomeworkReview.decision == ReviewDecision.ACCEPTED,
            )
            .exists()
        )
        late = (
            select(HomeworkSubmission.id)
            .where(
                HomeworkSubmission.homework_id == Homework.id,
                HomeworkSubmission.is_late.is_(True),
                HomeworkSubmission.submitted_at > Homework.due_at,
            )
            .exists()
        )
        revision_required = (
            select(HomeworkReview.id)
            .join(HomeworkSubmission, HomeworkSubmission.id == HomeworkReview.submission_id)
            .where(
                HomeworkSubmission.homework_id == Homework.id,
                HomeworkReview.decision == ReviewDecision.NEEDS_REVISION,
            )
            .exists()
        )
        row = (
            await self._session.execute(
                select(
                    func.count(Homework.id),
                    func.count(case((submitted, 1))),
                    func.count(case((accepted, 1))),
                    func.count(case((late, 1))),
                    func.count(case((revision_required, 1))),
                ).where(
                    Homework.teacher_id == teacher_id,
                    Homework.student_id == student_id,
                    Homework.created_at >= date_from,
                    Homework.created_at < date_to,
                )
            )
        ).one()
        return HomeworkStatisticsCounts(
            assigned=int(row[0]),
            submitted=int(row[1]),
            reviewed=int(row[2]),
            late=int(row[3]),
            revision_required=int(row[4]),
        )
