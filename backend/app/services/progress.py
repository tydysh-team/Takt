from datetime import datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConnectionNotFoundError, ForbiddenError
from app.models.enums import RoleCode
from app.models.user import User
from app.repositories.homework_statistics import HomeworkStatisticsRepository
from app.repositories.lessons import LessonRepository
from app.repositories.review_statistics import ReviewStatisticsRepository
from app.repositories.teacher_student_relations import TeacherStudentRelationRepository
from app.schemas.lessons import LessonHistoryRequest
from app.schemas.progress import ProgressResponse, ReviewStatisticsDTO
from app.services.homework_statistics import homework_statistics_dto
from app.services.lesson_views import calculate_lesson_history_aggregates, lesson_to_history_item


class ProgressService:
    def __init__(self, session: AsyncSession) -> None:
        self._relations = TeacherStudentRelationRepository(session)
        self._lessons = LessonRepository(session)
        self._homework = HomeworkStatisticsRepository(session)
        self._reviews = ReviewStatisticsRepository(session)

    async def for_teacher(
        self, teacher: User, student_id: UUID, period: LessonHistoryRequest, *, now: datetime
    ) -> ProgressResponse:
        if teacher.role != RoleCode.TEACHER or not teacher.is_active:
            raise ForbiddenError()
        if await self._relations.get_student(teacher.id, student_id) is None:
            raise ConnectionNotFoundError()
        return await self._calculate(student_id, teacher.id, period, now=now)

    async def for_student(
        self, student: User, period: LessonHistoryRequest, *, now: datetime
    ) -> ProgressResponse:
        if student.role != RoleCode.STUDENT or not student.is_active:
            raise ForbiddenError()
        # Scope by the authenticated student's id. Historical rows remain visible
        # even if a teacher connection has since become inactive.
        return await self._calculate(student.id, None, period, now=now)

    async def _calculate(
        self, student_id: UUID, teacher_id: UUID | None, period: LessonHistoryRequest,
        *, now: datetime,
    ) -> ProgressResponse:
        lessons = await self._lessons.list_student_history(
            teacher_id, student_id, date_from=period.date_from, date_to=period.date_to
        )
        attendance = calculate_lesson_history_aggregates(
            lesson_to_history_item(lesson, now) for lesson in lessons
        )
        homework = await self._homework.count_for_student(
            teacher_id, student_id, period.date_from, period.date_to
        )
        reviews = await self._reviews.for_student(
            teacher_id, student_id, period.date_from, period.date_to
        )
        return ProgressResponse(
            student_id=student_id,
            date_from=period.date_from,
            date_to=period.date_to,
            attendance=attendance,
            homework=homework_statistics_dto(homework),
            reviews=ReviewStatisticsDTO(
                graded_homework=reviews.graded_homework,
                average_grade=reviews.average_grade,
            ),
        )
