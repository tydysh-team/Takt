from datetime import UTC, datetime, timedelta

import pytest

from app.models.enums import AttendanceStatus, AttendanceValue, LessonStatus
from app.models.lesson import Lesson
from app.services.lesson_views import (
    attendance_status,
    calculate_lesson_status,
    lesson_ends_at,
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
