from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    AttendanceNotAvailableError,
    ForbiddenError,
    LessonNotCancellableError,
    LessonNotFoundError,
    LessonNotReschedulableError,
    LessonScheduleUnchangedError,
    LessonSeriesTimeInvalidError,
    LessonStartInPastError,
    LessonTimeConflictError,
    StudentNotAvailableError,
)
from app.core.security import utc_now
from app.models.enums import AttendanceValue, LessonStatus, RoleCode
from app.models.lesson import Lesson
from app.models.user import User
from app.repositories.lessons import (
    LessonAccessScope,
    LessonConflictRecord,
    LessonRecord,
    LessonRepository,
)
from app.repositories.teacher_student_relations import TeacherStudentRelationRepository
from app.repositories.users import UserRepository
from app.schemas.connections import StudentRefDTO
from app.schemas.lessons import (
    LessonAttendanceUpdateRequest,
    LessonCancelRequest,
    LessonConflictDTO,
    LessonCreate,
    LessonRescheduleRequest,
    LessonSearchRequest,
    LessonSeriesCreate,
)
from app.services.lesson_series import (
    LessonSeriesTimeError,
    SeriesInterval,
    SeriesOverlap,
    build_series_intervals,
    find_series_overlaps,
    generate_weekly_starts,
)
from app.services.lesson_views import calculate_lesson_status, lesson_ends_at


class LessonService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._lessons = LessonRepository(session)
        self._relations = TeacherStudentRelationRepository(session)
        self._users = UserRepository(session)

    async def create(self, teacher: User, payload: LessonCreate) -> Lesson:
        try:
            await self._lock_teacher(teacher)
            student = await self._relations.get_student(
                teacher.id,
                payload.student_id,
                for_update=True,
            )
            if student is None:
                raise StudentNotAvailableError()
            now = utc_now()
            if payload.starts_at < now:
                raise LessonStartInPastError()

            conflicts = await self._lessons.find_conflicts(
                teacher.id,
                payload.starts_at,
                payload.duration_minutes,
            )
            if conflicts and not payload.confirm_conflict:
                raise self._conflict_error(conflicts)

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
        except Exception:
            await self._session.rollback()
            raise
        return lesson

    async def create_series(self, teacher: User, payload: LessonSeriesCreate) -> list[Lesson]:
        try:
            locked_teacher = await self._lock_teacher(teacher)
            student = await self._relations.get_student(
                teacher.id,
                payload.student_id,
                for_update=True,
            )
            if student is None:
                raise StudentNotAvailableError()

            timezone_name = (
                locked_teacher.profile.timezone
                if locked_teacher.profile is not None
                else None
            )
            if timezone_name is None:
                raise LessonSeriesTimeInvalidError(
                    message="В профиле преподавателя не указана timezone."
                )
            try:
                starts = generate_weekly_starts(
                    payload.starts_at,
                    timezone_name,
                    payload.count,
                )
                intervals = build_series_intervals(starts, payload.duration_minutes)
            except LessonSeriesTimeError as exc:
                raise LessonSeriesTimeInvalidError(message=str(exc)) from exc

            now = utc_now()
            if any(interval.starts_at < now for interval in intervals):
                raise LessonStartInPastError()

            existing_conflicts: list[tuple[SeriesInterval, LessonConflictRecord]] = []
            for interval in intervals:
                conflicts = await self._lessons.find_conflicts(
                    teacher.id,
                    interval.starts_at,
                    payload.duration_minutes,
                )
                existing_conflicts.extend((interval, conflict) for conflict in conflicts)
            series_conflicts = find_series_overlaps(intervals)
            if (existing_conflicts or series_conflicts) and not payload.confirm_conflict:
                raise self._series_conflict_error(existing_conflicts, series_conflicts)

            lessons = [
                Lesson(
                    teacher_id=teacher.id,
                    student_id=payload.student_id,
                    title=payload.title,
                    description=payload.description,
                    starts_at=interval.starts_at,
                    duration_minutes=payload.duration_minutes,
                )
                for interval in intervals
            ]
            self._session.add_all(lessons)
            await self._session.commit()
        except Exception:
            await self._session.rollback()
            raise
        return lessons

    async def reschedule(
        self,
        teacher: User,
        lesson_id: UUID,
        payload: LessonRescheduleRequest,
    ) -> LessonRecord:
        try:
            await self._lock_teacher(teacher)
            record = await self._lessons.get_teacher_lesson_for_update(teacher.id, lesson_id)
            if record is None:
                raise LessonNotFoundError()

            lesson = record.lesson
            now = utc_now()
            if calculate_lesson_status(lesson, now) != LessonStatus.PLANNED:
                raise LessonNotReschedulableError()
            if payload.starts_at < now:
                raise LessonStartInPastError()
            if payload.starts_at == lesson.starts_at:
                raise LessonScheduleUnchangedError()

            conflicts = await self._lessons.find_conflicts(
                teacher.id,
                payload.starts_at,
                lesson.duration_minutes,
                exclude_lesson_id=lesson.id,
            )
            if conflicts and not payload.confirm_conflict:
                raise self._conflict_error(conflicts)

            lesson.starts_at = payload.starts_at
            lesson.rescheduled_at = now
            await self._session.commit()
        except Exception:
            await self._session.rollback()
            raise
        return record

    async def cancel(
        self,
        teacher: User,
        lesson_id: UUID,
        payload: LessonCancelRequest | None = None,
    ) -> LessonRecord:
        try:
            await self._lock_teacher(teacher)
            record = await self._lessons.get_teacher_lesson_for_update(teacher.id, lesson_id)
            if record is None:
                raise LessonNotFoundError()

            lesson = record.lesson
            now = utc_now()
            if lesson.cancelled_at is not None:
                await self._session.commit()
                return record
            if calculate_lesson_status(lesson, now) != LessonStatus.PLANNED:
                raise LessonNotCancellableError()

            lesson.cancelled_at = now
            lesson.cancellation_reason = payload.reason if payload is not None else None
            await self._session.commit()
        except Exception:
            await self._session.rollback()
            raise
        return record

    async def update_attendance(
        self,
        teacher: User,
        lesson_id: UUID,
        payload: LessonAttendanceUpdateRequest,
    ) -> LessonRecord:
        try:
            await self._lock_teacher(teacher)
            record = await self._lessons.get_teacher_lesson_for_update(teacher.id, lesson_id)
            if record is None:
                raise LessonNotFoundError()

            lesson = record.lesson
            now = utc_now()
            if calculate_lesson_status(lesson, now) not in (
                LessonStatus.IN_PROGRESS,
                LessonStatus.COMPLETED,
            ):
                raise AttendanceNotAvailableError()

            value = (
                AttendanceValue.PRESENT
                if payload.attendance == "present"
                else AttendanceValue.ABSENT
            )
            if lesson.attendance != value:
                lesson.attendance = value
                lesson.attendance_updated_at = now
            await self._session.commit()
        except Exception:
            await self._session.rollback()
            raise
        return record

    async def _lock_teacher(self, teacher: User) -> User:
        locked_teacher = await self._users.get_by_id(teacher.id, for_update=True)
        if locked_teacher is None:
            raise ForbiddenError()
        return locked_teacher

    @staticmethod
    def _conflict_error(conflicts: list[LessonConflictRecord]) -> LessonTimeConflictError:
        items = [
            LessonConflictDTO(
                id=record.lesson.id,
                title=record.lesson.title,
                starts_at=record.lesson.starts_at,
                ends_at=lesson_ends_at(record.lesson),
                duration_minutes=record.lesson.duration_minutes,
                student=StudentRefDTO(
                    id=record.lesson.student_id,
                    first_name=record.student_profile.first_name,
                    last_name=record.student_profile.last_name,
                    middle_name=record.student_profile.middle_name,
                ),
            ).model_dump(mode="json")
            for record in conflicts
        ]
        return LessonTimeConflictError(context={"conflicts": items})

    @classmethod
    def _series_conflict_error(
        cls,
        existing: list[tuple[SeriesInterval, LessonConflictRecord]],
        internal: list[SeriesOverlap],
    ) -> LessonTimeConflictError:
        conflicts: list[dict[str, Any]] = []
        for interval, record in existing:
            item = cls._conflict_error([record]).context
            assert item is not None
            existing_lesson = item["conflicts"][0]
            conflicts.append(
                {
                    "type": "existing_lesson",
                    "series_index": interval.index,
                    "series_number": interval.index + 1,
                    "series_starts_at": interval.starts_at.isoformat(),
                    "series_ends_at": interval.ends_at.isoformat(),
                    "lesson": existing_lesson,
                }
            )
        conflicts.extend(
            {
                "type": "within_series",
                "series_index": overlap.first.index,
                "series_number": overlap.first.index + 1,
                "series_starts_at": overlap.first.starts_at.isoformat(),
                "series_ends_at": overlap.first.ends_at.isoformat(),
                "other_series_index": overlap.second.index,
                "other_series_number": overlap.second.index + 1,
                "other_series_starts_at": overlap.second.starts_at.isoformat(),
                "other_series_ends_at": overlap.second.ends_at.isoformat(),
            }
            for overlap in internal
        )
        return LessonTimeConflictError(context={"conflicts": conflicts})

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
