from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.lesson import Lesson
from app.models.profile import Profile


@dataclass(frozen=True, slots=True)
class LessonAccessScope:
    teacher_id: UUID | None = None
    student_id: UUID | None = None


@dataclass(frozen=True, slots=True)
class LessonRecord:
    lesson: Lesson
    teacher_profile: Profile
    student_profile: Profile


class LessonRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def add(self, lesson: Lesson) -> None:
        self._session.add(lesson)

    async def search(
        self,
        scope: LessonAccessScope,
        *,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> list[LessonRecord]:
        teacher_profile = aliased(Profile)
        student_profile = aliased(Profile)
        statement = (
            select(Lesson, teacher_profile, student_profile)
            .join(teacher_profile, teacher_profile.user_id == Lesson.teacher_id)
            .join(student_profile, student_profile.user_id == Lesson.student_id)
        )
        if scope.teacher_id is not None:
            statement = statement.where(Lesson.teacher_id == scope.teacher_id)
        elif scope.student_id is not None:
            statement = statement.where(Lesson.student_id == scope.student_id)
        if date_from is not None:
            statement = statement.where(Lesson.starts_at >= date_from)
        if date_to is not None:
            statement = statement.where(Lesson.starts_at < date_to)
        statement = statement.order_by(Lesson.starts_at.asc(), Lesson.id.asc())
        rows = (await self._session.execute(statement)).all()
        return [
            LessonRecord(
                lesson=row[0],
                teacher_profile=row[1],
                student_profile=row[2],
            )
            for row in rows
        ]

    async def get_accessible_by_id(
        self,
        lesson_id: UUID,
        scope: LessonAccessScope,
    ) -> LessonRecord | None:
        teacher_profile = aliased(Profile)
        student_profile = aliased(Profile)
        statement = (
            select(Lesson, teacher_profile, student_profile)
            .join(teacher_profile, teacher_profile.user_id == Lesson.teacher_id)
            .join(student_profile, student_profile.user_id == Lesson.student_id)
            .where(Lesson.id == lesson_id)
        )
        if scope.teacher_id is not None:
            statement = statement.where(Lesson.teacher_id == scope.teacher_id)
        elif scope.student_id is not None:
            statement = statement.where(Lesson.student_id == scope.student_id)
        row = (await self._session.execute(statement)).one_or_none()
        if row is None:
            return None
        return LessonRecord(
            lesson=row[0],
            teacher_profile=row[1],
            student_profile=row[2],
        )
