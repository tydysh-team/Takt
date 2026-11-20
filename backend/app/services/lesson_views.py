"""Pure lesson state calculation and response mapping."""

from collections.abc import Iterable
from datetime import datetime, timedelta

from app.models.enums import AttendanceStatus, AttendanceValue, LessonStatus
from app.models.lesson import Lesson
from app.repositories.lessons import LessonRecord
from app.schemas.connections import StudentRefDTO
from app.schemas.lessons import (
    LessonDTO,
    LessonHistoryAggregatesDTO,
    LessonHistoryItemDTO,
    LessonReadDTO,
)


def lesson_ends_at(lesson: Lesson) -> datetime:
    return lesson.starts_at + timedelta(minutes=lesson.duration_minutes)


def calculate_lesson_status(lesson: Lesson, now: datetime) -> LessonStatus:
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("now must be timezone-aware")
    if lesson.starts_at.tzinfo is None or lesson.starts_at.utcoffset() is None:
        raise ValueError("lesson.starts_at must be timezone-aware")
    if lesson.cancelled_at is not None:
        return LessonStatus.CANCELLED
    if now < lesson.starts_at:
        return LessonStatus.PLANNED
    if now < lesson_ends_at(lesson):
        return LessonStatus.IN_PROGRESS
    return LessonStatus.COMPLETED


def attendance_status(value: AttendanceValue | None) -> AttendanceStatus:
    if value is None:
        return AttendanceStatus.NOT_SET
    if value == AttendanceValue.PRESENT:
        return AttendanceStatus.PRESENT
    if value == AttendanceValue.ABSENT:
        return AttendanceStatus.ABSENT
    raise ValueError("Unsupported lesson attendance value")


def lesson_to_dto(lesson: Lesson, now: datetime) -> LessonDTO:
    return LessonDTO(
        id=lesson.id,
        teacher_id=lesson.teacher_id,
        student_id=lesson.student_id,
        title=lesson.title,
        description=lesson.description,
        starts_at=lesson.starts_at,
        ends_at=lesson_ends_at(lesson),
        duration_minutes=lesson.duration_minutes,
        status=calculate_lesson_status(lesson, now),
        is_rescheduled=lesson.rescheduled_at is not None,
        attendance=attendance_status(lesson.attendance),
        cancellation_reason=lesson.cancellation_reason,
    )


def lesson_to_history_item(lesson: Lesson, now: datetime) -> LessonHistoryItemDTO:
    return LessonHistoryItemDTO(
        id=lesson.id,
        title=lesson.title,
        starts_at=lesson.starts_at,
        ends_at=lesson_ends_at(lesson),
        status=calculate_lesson_status(lesson, now),
        attendance=attendance_status(lesson.attendance),
    )


def calculate_lesson_history_aggregates(
    history: Iterable[LessonHistoryItemDTO],
) -> LessonHistoryAggregatesDTO:
    items = list(history)
    completed = 0
    attended = 0
    missed = 0
    unmarked = 0
    cancelled = 0

    for item in items:
        if item.status == LessonStatus.CANCELLED:
            cancelled += 1
            continue
        if item.status != LessonStatus.COMPLETED:
            continue

        completed += 1
        if item.attendance == AttendanceStatus.PRESENT:
            attended += 1
        elif item.attendance == AttendanceStatus.ABSENT:
            missed += 1
        else:
            unmarked += 1

    marked_completed = attended + missed
    attendance_rate = (
        round(attended * 100 / marked_completed, 2) if marked_completed else None
    )
    return LessonHistoryAggregatesDTO(
        total_lessons=len(items),
        completed_lessons=completed,
        attended_lessons=attended,
        missed_lessons=missed,
        unmarked_lessons=unmarked,
        cancelled_lessons=cancelled,
        attendance_rate=attendance_rate,
    )


def lesson_record_to_dto(record: LessonRecord, now: datetime) -> LessonReadDTO:
    lesson = record.lesson
    return LessonReadDTO(
        id=lesson.id,
        title=lesson.title,
        description=lesson.description,
        starts_at=lesson.starts_at,
        ends_at=lesson_ends_at(lesson),
        duration_minutes=lesson.duration_minutes,
        status=calculate_lesson_status(lesson, now),
        is_rescheduled=lesson.rescheduled_at is not None,
        attendance=attendance_status(lesson.attendance),
        cancellation_reason=lesson.cancellation_reason,
        teacher=StudentRefDTO(
            id=lesson.teacher_id,
            first_name=record.teacher_profile.first_name,
            last_name=record.teacher_profile.last_name,
            middle_name=record.teacher_profile.middle_name,
        ),
        student=StudentRefDTO(
            id=lesson.student_id,
            first_name=record.student_profile.first_name,
            last_name=record.student_profile.last_name,
            middle_name=record.student_profile.middle_name,
        ),
    )
