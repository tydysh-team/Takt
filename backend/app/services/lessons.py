from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import LessonStartInPastError, StudentNotAvailableError
from app.core.security import utc_now
from app.models.lesson import Lesson
from app.models.user import User
from app.repositories.lessons import LessonRepository
from app.repositories.teacher_student_relations import TeacherStudentRelationRepository
from app.schemas.lessons import LessonCreate


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
