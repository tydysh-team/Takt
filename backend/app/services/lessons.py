from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    ForbiddenError,
    LessonNotFoundError,
    LessonStartInPastError,
    StudentNotAvailableError,
)
from app.core.security import utc_now
from app.models.enums import RoleCode
from app.models.lesson import Lesson
from app.models.user import User
from app.repositories.lessons import LessonAccessScope, LessonRecord, LessonRepository
from app.repositories.teacher_student_relations import TeacherStudentRelationRepository
from app.schemas.lessons import LessonCreate, LessonSearchRequest


class LessonService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._lessons = LessonRepository(session)
        self._relations = TeacherStudentRelationRepository(session)

    async def create(self, teacher: User, payload: LessonCreate) -> Lesson:
        now = utc_now()
        if payload.starts_at < now:
            raise LessonStartInPastError()

        try:
            student = await self._relations.get_student(
                teacher.id,
                payload.student_id,
                for_update=True,
            )
            if student is None:
                raise StudentNotAvailableError()

            lesson = Lesson(
                teacher_id=teacher.id,
                student_id=payload.student_id,
                title=payload.title,
                description=payload.description,
                starts_at=payload.starts_at,
                duration_minutes=payload.duration_minutes,
            )
            self._lessons.add(lesson)
            await self._session.commit()
        except StudentNotAvailableError:
            await self._session.rollback()
            raise
        except Exception:
            await self._session.rollback()
            raise
        return lesson

    async def search(self, user: User, filters: LessonSearchRequest) -> list[LessonRecord]:
        return await self._lessons.search(
            self._access_scope(user),
            date_from=filters.date_from,
            date_to=filters.date_to,
        )

    async def get_by_id(self, user: User, lesson_id: UUID) -> LessonRecord:
        record = await self._lessons.get_accessible_by_id(
            lesson_id,
            self._access_scope(user),
        )
        if record is None:
            raise LessonNotFoundError()
        return record

    @staticmethod
    def _access_scope(user: User) -> LessonAccessScope:
        if user.role == RoleCode.TEACHER:
            return LessonAccessScope(teacher_id=user.id)
        if user.role == RoleCode.STUDENT:
            return LessonAccessScope(student_id=user.id)
        if user.role == RoleCode.ADMIN:
            return LessonAccessScope()
        raise ForbiddenError()
