"""Unit coverage for weekly series calculations."""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.services.lesson_series import (
    LessonSeriesTimeError,
    build_series_intervals,
    find_series_overlaps,
    generate_weekly_starts,
)


@pytest.mark.parametrize("count", [2, 4, 52])
def test_generate_requested_number_in_strict_order(count: int) -> None:
    starts = generate_weekly_starts(
        datetime(2030, 1, 7, 9, tzinfo=ZoneInfo("Europe/Moscow")),
        "Europe/Moscow",
        count,
    )

    assert len(starts) == count
    assert starts == sorted(starts)
    assert all(start.weekday() == 0 and start.hour == 6 for start in starts)


@pytest.mark.parametrize(
    ("first", "expected_last_date"),
    [
        (datetime(2030, 1, 28, 10, tzinfo=UTC), datetime(2030, 2, 18).date()),
        (datetime(2030, 12, 22, 10, tzinfo=UTC), datetime(2031, 1, 12).date()),
    ],
)
def test_generation_crosses_month_and_year(
    first: datetime,
    expected_last_date: object,
) -> None:
    starts = generate_weekly_starts(first, "UTC", 4)

    assert starts[-1].date() == expected_last_date


@pytest.mark.parametrize(
    ("first", "expected_offsets"),
    [
        (
            datetime(2030, 2, 24, 9, tzinfo=ZoneInfo("America/New_York")),
            [timedelta(hours=-5), timedelta(hours=-5), timedelta(hours=-4), timedelta(hours=-4)],
        ),
        (
            datetime(2030, 10, 20, 9, tzinfo=ZoneInfo("America/New_York")),
            [timedelta(hours=-4), timedelta(hours=-4), timedelta(hours=-5), timedelta(hours=-5)],
        ),
    ],
)
def test_generation_preserves_local_time_across_dst(
    first: datetime,
    expected_offsets: list[timedelta],
) -> None:
    timezone = ZoneInfo("America/New_York")
    local_starts = [
        value.astimezone(timezone)
        for value in generate_weekly_starts(first, timezone.key, 4)
    ]

    assert [(value.weekday(), value.hour, value.minute) for value in local_starts] == [
        (6, 9, 0),
        (6, 9, 0),
        (6, 9, 0),
        (6, 9, 0),
    ]
    assert [value.utcoffset() for value in local_starts] == expected_offsets


@pytest.mark.parametrize(
    "first",
    [
        datetime(2030, 3, 10, 2, 30, tzinfo=ZoneInfo("America/New_York")),
        datetime(2030, 11, 3, 1, 30, tzinfo=ZoneInfo("America/New_York")),
        datetime(2030, 3, 3, 2, 30, tzinfo=ZoneInfo("America/New_York")),
        datetime(2030, 10, 27, 1, 30, tzinfo=ZoneInfo("America/New_York")),
    ],
)
def test_generation_rejects_nonexistent_or_ambiguous_local_time(first: datetime) -> None:
    with pytest.raises(LessonSeriesTimeError, match="does not exist|ambiguous"):
        generate_weekly_starts(first, "America/New_York", 2)


@pytest.mark.parametrize(
    ("start", "timezone_name", "count"),
    [
        (datetime(2030, 1, 1), "UTC", 2),
        (datetime(2030, 1, 1, tzinfo=UTC), "Not/A_Timezone", 2),
        (datetime(2030, 1, 1, tzinfo=UTC), "UTC", 1),
        (datetime(2030, 1, 1, tzinfo=UTC), "UTC", 53),
        (datetime.max.replace(tzinfo=UTC), "UTC", 2),
    ],
)
def test_generation_rejects_invalid_or_overflowing_input(
    start: datetime,
    timezone_name: str,
    count: int,
) -> None:
    with pytest.raises(LessonSeriesTimeError):
        generate_weekly_starts(start, timezone_name, count)


def test_first_value_preserves_the_requested_instant() -> None:
    requested = datetime(2030, 1, 7, 18, tzinfo=ZoneInfo("Asia/Tokyo"))

    generated = generate_weekly_starts(requested, "Europe/Moscow", 2)

    assert generated[0] == requested.astimezone(UTC)
    assert generated[0].astimezone(ZoneInfo("Europe/Moscow")).hour == 12


def test_internal_overlap_uses_open_interval_boundaries() -> None:
    starts = generate_weekly_starts(datetime(2030, 1, 7, tzinfo=UTC), "UTC", 3)

    touching = find_series_overlaps(build_series_intervals(starts, 7 * 24 * 60))
    overlapping = find_series_overlaps(build_series_intervals(starts, 7 * 24 * 60 + 1))

    assert touching == []
    assert [(item.first.index, item.second.index) for item in overlapping] == [(0, 1), (1, 2)]


def test_interval_end_overflow_is_controlled() -> None:
    with pytest.raises(LessonSeriesTimeError, match="duration"):
        build_series_intervals([datetime.max.replace(tzinfo=UTC)], 1)
