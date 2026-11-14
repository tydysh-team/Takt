from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConnectionNotFoundError, ForbiddenError
from app.models.enums import RoleCode
from app.models.user import User
from app.repositories.homework_statistics import HomeworkStatisticsRepository
from app.repositories.teacher_student_relations import TeacherStudentRelationRepository
from app.schemas.homework_statistics import (
    HomeworkStatisticsDTO,
    HomeworkStatisticsRequest,
    HomeworkStatisticsResponse,
)


class HomeworkStatisticsService:
    def __init__(self, session: AsyncSession) -> None:
        self._relations = TeacherStudentRelationRepository(session)
        self._statistics = HomeworkStatisticsRepository(session)

    async def for_student(
        self, teacher: User, student_id: UUID, period: HomeworkStatisticsRequest
    ) -> HomeworkStatisticsResponse:
        if teacher.role != RoleCode.TEACHER or not teacher.is_active:
            raise ForbiddenError()
        if await self._relations.get_student(teacher.id, student_id) is None:
            raise ConnectionNotFoundError()

        counts = await self._statistics.count_for_student(
            teacher.id, student_id, period.date_from, period.date_to
        )
        # A completed assignment has a saved accepted review, not merely a submission.
        # reviewed is therefore the numerator. Round to two decimal places for the API.
        completion_rate = (
            round(counts.reviewed / counts.assigned * 100, 2) if counts.assigned else None
        )
        return HomeworkStatisticsResponse(
            student_id=student_id,
            date_from=period.date_from,
            date_to=period.date_to,
            statistics=HomeworkStatisticsDTO(
                assigned=counts.assigned,
                submitted=counts.submitted,
                reviewed=counts.reviewed,
                late=counts.late,
                revision_required=counts.revision_required,
                completion_rate=completion_rate,
            ),
        )
