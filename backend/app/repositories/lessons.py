from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.lesson import Lesson
from app.models.profile import Profile
from app.models.user import User


@dataclass(frozen=True, slots=True)
class LessonAccessScope:
    teacher_id: UUID | None = None
    student_id: UUID | None = None


@dataclass(frozen=True, slots=True)
class LessonRecord:
    lesson: Lesson
    teacher_profile: Profile
    student_profile: Profile


@dataclass(frozen=True, slots=True)
class LessonConflictRecord:
    lesson: Lesson
    student_profile: Profile


class LessonRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def add(self, lesson: Lesson) -> None:
        self._session.add(lesson)

    async def lock_student_schedule(self, student_id: UUID) -> None:
        # All schedule writes lock teacher, then student, then the relation or lesson.
        # A student row is shared by every teacher and serializes conflict checks.
        await self._session.execute(
            select(User.id)
            .where(User.id == student_id)
            .with_for_update(of=User, key_share=True)
        )

    async def find_student_conflicts(
        self,
        student_id: UUID,
        teacher_id: UUID,
        starts_at: datetime,
        duration_minutes: int,
        *,
        exclude_lesson_id: UUID | None = None,
    ) -> list[tuple[datetime, datetime]]:
        ends_at = starts_at + timedelta(minutes=duration_minutes)
        existing_ends_at = Lesson.starts_at + Lesson.duration_minutes * literal_column(
            "INTERVAL '1 minute'"
        )
        statement = select(Lesson.starts_at, Lesson.duration_minutes).where(
            Lesson.student_id == student_id,
            Lesson.teacher_id != teacher_id,
            Lesson.cancelled_at.is_(None),
            Lesson.starts_at < ends_at,
            existing_ends_at > starts_at,
        )
        if exclude_lesson_id is not None:
            statement = statement.where(Lesson.id != exclude_lesson_id)
        rows = (await self._session.execute(statement.order_by(Lesson.starts_at))).all()
        return [
            (row.starts_at, row.starts_at + timedelta(minutes=row.duration_minutes))
            for row in rows
        ]

    async def find_conflicts(
        self,
        teacher_id: UUID,
        starts_at: datetime,
        duration_minutes: int,
        *,
        exclude_lesson_id: UUID | None = None,
    ) -> list[LessonConflictRecord]:
        ends_at = starts_at + timedelta(minutes=duration_minutes)
        existing_ends_at = Lesson.starts_at + Lesson.duration_minutes * literal_column(
            "INTERVAL '1 minute'"
        )
        statement = (
            select(Lesson, Profile)
            .join(Profile, Profile.user_id == Lesson.student_id)
            .where(
                Lesson.teacher_id == teacher_id,
                Lesson.cancelled_at.is_(None),
                Lesson.starts_at < ends_at,
                existing_ends_at > starts_at,
            )
        )
        if exclude_lesson_id is not None:
            statement = statement.where(Lesson.id != exclude_lesson_id)
        statement = statement.order_by(Lesson.starts_at.asc(), Lesson.id.asc())
        rows = (await self._session.execute(statement)).all()
        return [LessonConflictRecord(lesson=row[0], student_profile=row[1]) for row in rows]

    async def get_teacher_lesson_for_update(
        self,
        teacher_id: UUID,
        lesson_id: UUID,
    ) -> LessonRecord | None:
        teacher_profile = aliased(Profile)
        student_profile = aliased(Profile)
        statement = (
            select(Lesson, teacher_profile, student_profile)
            .join(teacher_profile, teacher_profile.user_id == Lesson.teacher_id)
            .join(student_profile, student_profile.user_id == Lesson.student_id)
            .where(Lesson.id == lesson_id, Lesson.teacher_id == teacher_id)
            .with_for_update(of=Lesson)
        )
        row = (await self._session.execute(statement)).one_or_none()
        if row is None:
            return None
        return LessonRecord(
            lesson=row[0],
            teacher_profile=row[1],
            student_profile=row[2],
        )

    async def get_teacher_lesson_student_id(
        self, teacher_id: UUID, lesson_id: UUID,
    ) -> UUID | None:
        return await self._session.scalar(
            select(Lesson.student_id).where(
                Lesson.id == lesson_id, Lesson.teacher_id == teacher_id,
            )
        )

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

    async def person_schedule(
        self,
        teacher_id: UUID,
        student_id: UUID,
        *,
        date_from: datetime,
        date_to: datetime,
        now: datetime,
        selected_is_teacher: bool,
    ) -> tuple[list[LessonRecord], list[tuple[datetime, datetime]]]:
        teacher_profile = aliased(Profile)
        student_profile = aliased(Profile)
        existing_end = Lesson.starts_at + Lesson.duration_minutes * literal_column(
            "INTERVAL '1 minute'"
        )
        in_range = (Lesson.starts_at < date_to, existing_end > date_from)
        common = (
            select(Lesson, teacher_profile, student_profile)
            .join(teacher_profile, teacher_profile.user_id == Lesson.teacher_id)
            .join(student_profile, student_profile.user_id == Lesson.student_id)
            .where(Lesson.teacher_id == teacher_id, Lesson.student_id == student_id, *in_range)
            .order_by(Lesson.starts_at, Lesson.id)
        )
        rows = (await self._session.execute(common)).all()
        shared = [
            LessonRecord(lesson=row[0], teacher_profile=row[1], student_profile=row[2])
            for row in rows
        ]
        if selected_is_teacher:
            foreign_filter = Lesson.teacher_id == teacher_id
            third_party_filter = Lesson.student_id != student_id
        else:
            foreign_filter = Lesson.student_id == student_id
            third_party_filter = Lesson.teacher_id != teacher_id
        busy = select(Lesson.starts_at, Lesson.duration_minutes).where(
            foreign_filter,
            third_party_filter,
            Lesson.cancelled_at.is_(None),
            Lesson.starts_at < date_to,
            existing_end > date_from,
            existing_end > now,
        ).order_by(Lesson.starts_at)
        busy_rows = (await self._session.execute(busy)).all()
        return shared, [
            (row.starts_at, row.starts_at + timedelta(minutes=row.duration_minutes))
            for row in busy_rows
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
