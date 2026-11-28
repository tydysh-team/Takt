"""Pure lesson state calculation and response mapping."""

from collections.abc import Iterable
from datetime import datetime, timedelta
from uuid import UUID

from app.models.enums import AttendanceStatus, AttendanceValue, LessonStatus
from app.models.lesson import Lesson
from app.repositories.lessons import LessonRecord
from app.schemas.connections import StudentRefDTO
from app.schemas.lessons import (
    LessonDTO,
    LessonHistoryAggregatesDTO,
    LessonHistoryItemDTO,
    LessonReadDTO,
    StudentLessonParticipantDTO,
    TeacherLessonParticipantDTO,
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
        student_id=lesson.participants[0].student_id if len(lesson.participants) == 1 else None,
        student_ids=[p.student_id for p in lesson.participants],
        participant_count=len(lesson.participants),
        title=lesson.title,
        description=lesson.description,
        starts_at=lesson.starts_at,
        ends_at=lesson_ends_at(lesson),
        duration_minutes=lesson.duration_minutes,
        status=calculate_lesson_status(lesson, now),
        is_rescheduled=lesson.rescheduled_at is not None,
        attendance=attendance_status(
            lesson.participants[0].attendance if len(lesson.participants) == 1 else None
        ),
        cancellation_reason=lesson.cancellation_reason,
    )


def lesson_to_history_item(lesson: Lesson, now: datetime, student_id: UUID) -> LessonHistoryItemDTO:
    return LessonHistoryItemDTO(
        id=lesson.id,
        title=lesson.title,
        starts_at=lesson.starts_at,
        ends_at=lesson_ends_at(lesson),
        status=calculate_lesson_status(lesson, now),
        attendance=attendance_status(
            next(p.attendance for p in lesson.participants if p.student_id == student_id)
        ),
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
    attendance_rate = round(attended * 100 / marked_completed, 2) if marked_completed else None
    return LessonHistoryAggregatesDTO(
        total_lessons=len(items),
        completed_lessons=completed,
        attended_lessons=attended,
        missed_lessons=missed,
        unmarked_lessons=unmarked,
        cancelled_lessons=cancelled,
        attendance_rate=attendance_rate,
    )


def lesson_record_to_dto(
    record: LessonRecord,
    now: datetime,
    *,
    student_id: UUID | None = None,
    details: bool = False,
) -> LessonReadDTO:
    lesson = record.lesson
    single = lesson.participants[0] if len(lesson.participants) == 1 else None
    own = next((p for p in lesson.participants if p.student_id == student_id), None)
    visible_attendance = own if student_id is not None else single
    participants: list[TeacherLessonParticipantDTO | StudentLessonParticipantDTO] = []
    if student_id is None and single is None:
        participants = [
            TeacherLessonParticipantDTO(
                id=p.student_id,
                first_name=p.profile.first_name,
                last_name=p.profile.last_name,
                middle_name=p.profile.middle_name,
                attendance=attendance_status(p.attendance),
            )
            for p in lesson.participants
        ]
    elif details and own is not None and single is None:
        participants = [
            StudentLessonParticipantDTO(
                first_name=p.profile.first_name,
                last_name=p.profile.last_name,
                is_self=p.student_id == student_id,
            )
            for p in lesson.participants
        ]
    return LessonReadDTO(
        id=lesson.id,
        title=lesson.title,
        description=lesson.description,
        starts_at=lesson.starts_at,
        ends_at=lesson_ends_at(lesson),
        duration_minutes=lesson.duration_minutes,
        status=calculate_lesson_status(lesson, now),
        is_rescheduled=lesson.rescheduled_at is not None,
        attendance=attendance_status(
            visible_attendance.attendance if visible_attendance is not None else None
        ),
        cancellation_reason=lesson.cancellation_reason,
        teacher=StudentRefDTO(
            id=lesson.teacher_id,
            first_name=record.teacher_profile.first_name,
            last_name=record.teacher_profile.last_name,
            middle_name=record.teacher_profile.middle_name,
        ),
        student=(
            StudentRefDTO(
                id=single.student_id,
                first_name=single.profile.first_name,
                last_name=single.profile.last_name,
                middle_name=single.profile.middle_name,
            )
            if single is not None
            else None
        ),
        participant_count=len(lesson.participants),
        participants=participants,
    )
