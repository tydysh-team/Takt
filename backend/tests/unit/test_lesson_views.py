from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from app.models.enums import AttendanceStatus, AttendanceValue, LessonStatus
from app.models.lesson import Lesson
from app.services.lesson_views import (
    attendance_status,
    calculate_lesson_history_aggregates,
    calculate_lesson_status,
    lesson_ends_at,
    lesson_to_history_item,
)

START = datetime(2030, 1, 1, 12, tzinfo=UTC)


@pytest.mark.parametrize(
    ("offset", "cancelled", "expected"),
    [
        (timedelta(microseconds=-1), False, LessonStatus.PLANNED),
        (timedelta(), False, LessonStatus.IN_PROGRESS),
        (timedelta(minutes=30), False, LessonStatus.IN_PROGRESS),
        (timedelta(hours=1, microseconds=-1), False, LessonStatus.IN_PROGRESS),
        (timedelta(hours=1), False, LessonStatus.COMPLETED),
        (timedelta(hours=1, microseconds=1), False, LessonStatus.COMPLETED),
        (timedelta(microseconds=-1), True, LessonStatus.CANCELLED),
        (timedelta(minutes=30), True, LessonStatus.CANCELLED),
        (timedelta(hours=1, microseconds=1), True, LessonStatus.CANCELLED),
    ],
)
def test_lesson_status_boundaries(
    offset: timedelta,
    cancelled: bool,
    expected: LessonStatus,
) -> None:
    lesson = Lesson(starts_at=START, duration_minutes=60)
    lesson.cancelled_at = START - timedelta(days=1) if cancelled else None

    assert calculate_lesson_status(lesson, START + offset) == expected
    assert lesson_ends_at(lesson) == START + timedelta(hours=1)


def test_rescheduling_uses_current_start_without_replacing_lifecycle_status() -> None:
    lesson = Lesson(starts_at=START, duration_minutes=60)
    lesson.rescheduled_at = START - timedelta(days=1)
    lesson.starts_at = START + timedelta(days=1)

    assert calculate_lesson_status(lesson, START) == LessonStatus.PLANNED
    assert calculate_lesson_status(lesson, START + timedelta(days=1)) == LessonStatus.IN_PROGRESS
    assert calculate_lesson_status(lesson, START + timedelta(days=1, hours=1)) == (
        LessonStatus.COMPLETED
    )


@pytest.mark.parametrize(
    ("stored", "expected"),
    [
        (None, AttendanceStatus.NOT_SET),
        (AttendanceValue.PRESENT, AttendanceStatus.PRESENT),
        (AttendanceValue.ABSENT, AttendanceStatus.ABSENT),
    ],
)
def test_attendance_is_explicitly_mapped(
    stored: AttendanceValue | None,
    expected: AttendanceStatus,
) -> None:
    assert attendance_status(stored) == expected


def test_status_requires_aware_time() -> None:
    lesson = Lesson(starts_at=START, duration_minutes=60)

    with pytest.raises(ValueError, match="now must be timezone-aware"):
        calculate_lesson_status(lesson, START.replace(tzinfo=None))


def test_history_aggregates_only_completed_attendance() -> None:
    def item(
        offset: timedelta,
        *,
        attendance: AttendanceValue | None = None,
        cancelled: bool = False,
    ) -> Lesson:
        lesson = Lesson(
            id=uuid4(),
            title="History",
            starts_at=START + offset,
            duration_minutes=60,
            attendance=attendance,
        )
        lesson.cancelled_at = START if cancelled else None
        return lesson

    lessons = [
        item(-timedelta(hours=5), attendance=AttendanceValue.PRESENT),
        item(-timedelta(hours=4), attendance=AttendanceValue.ABSENT),
        item(-timedelta(hours=3)),
        item(-timedelta(hours=2), attendance=AttendanceValue.PRESENT, cancelled=True),
        item(-timedelta(minutes=30)),
        item(timedelta(hours=1)),
    ]
    history = [lesson_to_history_item(lesson, START) for lesson in lessons]

    result = calculate_lesson_history_aggregates(history)

    assert result.model_dump() == {
        "total_lessons": 6,
        "completed_lessons": 3,
        "attended_lessons": 1,
        "missed_lessons": 1,
        "unmarked_lessons": 1,
        "cancelled_lessons": 1,
        "attendance_rate": 50.0,
    }


def test_history_attendance_rate_is_null_without_marked_completed_lessons() -> None:
    lessons = [
        Lesson(
            id=uuid4(),
            title="Unmarked",
            starts_at=START - timedelta(hours=2),
            duration_minutes=60,
        ),
        Lesson(
            id=uuid4(),
            title="Planned",
            starts_at=START + timedelta(hours=2),
            duration_minutes=60,
        ),
    ]

    result = calculate_lesson_history_aggregates(
        lesson_to_history_item(lesson, START) for lesson in lessons
    )

    assert result.completed_lessons == 1
    assert result.unmarked_lessons == 1
    assert result.attendance_rate is None
