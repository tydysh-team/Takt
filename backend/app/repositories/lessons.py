from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import Select, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.lesson import Lesson, LessonParticipant
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


@dataclass(frozen=True, slots=True)
class LessonConflictRecord:
    lesson: Lesson


class LessonRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def add(self, lesson: Lesson) -> None:
        self._session.add(lesson)

    async def lock_student_schedule(self, student_id: UUID) -> None:
        # All schedule writes lock teacher, then student, then the relation or lesson.
        # A student row is shared by every teacher and serializes conflict checks.
        await self._session.execute(
            select(User.id).where(User.id == student_id).with_for_update(of=User, key_share=True)
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
            Lesson.participants.any(LessonParticipant.student_id == student_id),
            Lesson.teacher_id != teacher_id,
            Lesson.cancelled_at.is_(None),
            Lesson.starts_at < ends_at,
            existing_ends_at > starts_at,
        )
        if exclude_lesson_id is not None:
            statement = statement.where(Lesson.id != exclude_lesson_id)
        rows = (await self._session.execute(statement.order_by(Lesson.starts_at))).all()
        return [
            (row.starts_at, row.starts_at + timedelta(minutes=row.duration_minutes)) for row in rows
        ]

    async def find_participant_conflicts(
        self,
        student_ids: list[UUID],
        teacher_id: UUID,
        starts_at: datetime,
        duration_minutes: int,
        *,
        exclude_lesson_id: UUID | None = None,
    ) -> list[tuple[UUID, str, datetime, datetime]]:
        existing_end = Lesson.starts_at + Lesson.duration_minutes * literal_column(
            "INTERVAL '1 minute'"
        )
        statement = (
            select(
                LessonParticipant.student_id,
                Profile.first_name,
                Profile.last_name,
                Lesson.starts_at,
                Lesson.duration_minutes,
            )
            .join(Lesson, Lesson.id == LessonParticipant.lesson_id)
            .join(Profile, Profile.user_id == LessonParticipant.student_id)
            .where(
                LessonParticipant.student_id.in_(student_ids),
                Lesson.teacher_id != teacher_id,
                Lesson.cancelled_at.is_(None),
                Lesson.starts_at < starts_at + timedelta(minutes=duration_minutes),
                existing_end > starts_at,
            )
            .order_by(LessonParticipant.student_id, Lesson.starts_at, Lesson.id)
        )
        if exclude_lesson_id is not None:
            statement = statement.where(Lesson.id != exclude_lesson_id)
        return [
            (sid, f"{first} {last}", start, start + timedelta(minutes=duration))
            for sid, first, last, start, duration in (await self._session.execute(statement)).all()
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
        statement = self._select().where(
            Lesson.teacher_id == teacher_id,
            Lesson.cancelled_at.is_(None),
            Lesson.starts_at < ends_at,
            existing_ends_at > starts_at,
        )
        if exclude_lesson_id is not None:
            statement = statement.where(Lesson.id != exclude_lesson_id)
        records = await self._records(statement.order_by(Lesson.starts_at, Lesson.id))
        return [LessonConflictRecord(lesson=r.lesson) for r in records]

    @staticmethod
    def _select() -> Select[Lesson, Profile]:
        return (
            select(Lesson, Profile)
            .join(Profile, Profile.user_id == Lesson.teacher_id)
            .options(
                selectinload(Lesson.participants).selectinload(LessonParticipant.profile),
            )
            .execution_options(populate_existing=True)
        )

    async def _records(self, statement: Select[Lesson, Profile]) -> list[LessonRecord]:
        return [
            LessonRecord(lesson=row[0], teacher_profile=row[1])
            for row in (await self._session.execute(statement)).all()
        ]

    async def get_teacher_lesson_for_update(
        self, teacher_id: UUID, lesson_id: UUID
    ) -> LessonRecord | None:
        records = await self._records(
            self._select()
            .where(
                Lesson.id == lesson_id,
                Lesson.teacher_id == teacher_id,
            )
            .with_for_update(of=Lesson)
        )
        return records[0] if records else None

    async def get_teacher_lesson_student_ids(self, teacher_id: UUID, lesson_id: UUID) -> list[UUID]:
        return list(
            (
                await self._session.scalars(
                    select(LessonParticipant.student_id)
                    .join(Lesson)
                    .where(
                        Lesson.id == lesson_id,
                        Lesson.teacher_id == teacher_id,
                    )
                    .order_by(LessonParticipant.student_id)
                )
            ).all()
        )

    async def search(
        self,
        scope: LessonAccessScope,
        *,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> list[LessonRecord]:
        statement = self._scoped(self._select(), scope)
        if date_from is not None:
            statement = statement.where(Lesson.starts_at >= date_from)
        if date_to is not None:
            statement = statement.where(Lesson.starts_at < date_to)
        return await self._records(statement.order_by(Lesson.starts_at, Lesson.id))

    @staticmethod
    def _scoped(
        statement: Select[Lesson, Profile], scope: LessonAccessScope
    ) -> Select[Lesson, Profile]:
        if scope.teacher_id is not None:
            return statement.where(Lesson.teacher_id == scope.teacher_id)
        if scope.student_id is not None:
            return statement.where(
                Lesson.participants.any(LessonParticipant.student_id == scope.student_id)
            )
        return statement

    async def list_student_history(
        self,
        teacher_id: UUID | None,
        student_id: UUID,
        *,
        date_from: datetime,
        date_to: datetime,
    ) -> list[Lesson]:
        """Return one row per lesson in the half-open start-time interval."""
        statement = select(Lesson).where(
            Lesson.participants.any(LessonParticipant.student_id == student_id),
            Lesson.starts_at >= date_from,
            Lesson.starts_at < date_to,
        )
        if teacher_id is not None:
            statement = statement.where(Lesson.teacher_id == teacher_id)
        statement = statement.order_by(Lesson.starts_at.asc(), Lesson.id.asc())
        return list((await self._session.scalars(statement)).all())

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
        existing_end = Lesson.starts_at + Lesson.duration_minutes * literal_column(
            "INTERVAL '1 minute'"
        )
        shared = await self._records(
            self._select()
            .where(
                Lesson.teacher_id == teacher_id,
                Lesson.participants.any(LessonParticipant.student_id == student_id),
                Lesson.starts_at < date_to,
                existing_end > date_from,
            )
            .order_by(Lesson.starts_at, Lesson.id)
        )
        if selected_is_teacher:
            foreign_filter = Lesson.teacher_id == teacher_id
            third_party_filter = ~Lesson.participants.any(
                LessonParticipant.student_id == student_id
            )
        else:
            foreign_filter = Lesson.participants.any(LessonParticipant.student_id == student_id)
            third_party_filter = Lesson.teacher_id != teacher_id
        busy = (
            select(Lesson.starts_at, Lesson.duration_minutes)
            .where(
                foreign_filter,
                third_party_filter,
                Lesson.cancelled_at.is_(None),
                Lesson.starts_at < date_to,
                existing_end > date_from,
                existing_end > now,
            )
            .order_by(Lesson.starts_at)
        )
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
        records = await self._records(
            self._scoped(self._select(), scope).where(Lesson.id == lesson_id)
        )
        return records[0] if records else None
