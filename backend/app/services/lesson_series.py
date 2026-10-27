"""Pure weekly lesson-series calculations."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


class LessonSeriesTimeError(ValueError):
    """The requested series cannot be represented unambiguously."""


@dataclass(frozen=True, slots=True)
class SeriesInterval:
    index: int
    starts_at: datetime
    ends_at: datetime


@dataclass(frozen=True, slots=True)
class SeriesOverlap:
    first: SeriesInterval
    second: SeriesInterval


def generate_weekly_starts(
    starts_at: datetime,
    timezone_name: str,
    count: int,
) -> list[datetime]:
    """Generate UTC instants while preserving the teacher's local weekly time."""
    if starts_at.tzinfo is None or starts_at.utcoffset() is None:
        raise LessonSeriesTimeError("starts_at must be timezone-aware")
    if not 2 <= count <= 52:
        raise LessonSeriesTimeError("count must be between 2 and 52")

    try:
        timezone = ZoneInfo(timezone_name)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise LessonSeriesTimeError("Teacher profile contains an invalid IANA timezone") from exc

    try:
        _validate_explicit_local_time(starts_at, timezone)
        first_local = starts_at.astimezone(timezone).replace(tzinfo=None)
        generated = [
            _resolve_local_time(first_local + timedelta(weeks=index), timezone)
            for index in range(count)
        ]
    except (OverflowError, OSError) as exc:
        raise LessonSeriesTimeError("Weekly series exceeds the supported datetime range") from exc

    if generated[0] != starts_at.astimezone(UTC):
        raise LessonSeriesTimeError("starts_at does not map to the teacher's local timezone")
    return generated


def _validate_explicit_local_time(starts_at: datetime, timezone: ZoneInfo) -> None:
    """Validate wall time when the supplied offset belongs to the profile timezone.

    ISO datetimes do not retain an IANA zone name. Matching an offset supported by
    the profile zone is the signal that the client supplied profile-local wall time;
    other offsets remain valid representations of the same instant and are converted.
    """
    local_time = starts_at.replace(tzinfo=None)
    possible_offsets = {
        local_time.replace(tzinfo=timezone, fold=fold).utcoffset() for fold in (0, 1)
    }
    if starts_at.utcoffset() not in possible_offsets:
        return
    resolved = _resolve_local_time(local_time, timezone)
    if resolved != starts_at.astimezone(UTC):
        raise LessonSeriesTimeError(
            "starts_at offset does not match the teacher's local timezone"
        )


def build_series_intervals(
    starts_at: list[datetime],
    duration_minutes: int,
) -> list[SeriesInterval]:
    try:
        return [
            SeriesInterval(
                index=index,
                starts_at=start,
                ends_at=start + timedelta(minutes=duration_minutes),
            )
            for index, start in enumerate(starts_at)
        ]
    except OverflowError as exc:
        raise LessonSeriesTimeError("Lesson duration exceeds the supported datetime range") from exc


def find_series_overlaps(intervals: list[SeriesInterval]) -> list[SeriesOverlap]:
    return [
        SeriesOverlap(first=first, second=second)
        for first_index, first in enumerate(intervals)
        for second in intervals[first_index + 1 :]
        if first.starts_at < second.ends_at and first.ends_at > second.starts_at
    ]


def _resolve_local_time(local_time: datetime, timezone: ZoneInfo) -> datetime:
    interpretations: dict[datetime, datetime] = {}
    for fold in (0, 1):
        candidate = local_time.replace(tzinfo=timezone, fold=fold)
        utc_candidate = candidate.astimezone(UTC)
        round_trip = utc_candidate.astimezone(timezone).replace(tzinfo=None)
        if round_trip == local_time:
            interpretations[utc_candidate] = candidate

    if not interpretations:
        raise LessonSeriesTimeError(
            f"Local time {local_time.isoformat()} does not exist in {timezone.key}"
        )
    if len(interpretations) > 1:
        raise LessonSeriesTimeError(
            f"Local time {local_time.isoformat()} is ambiguous in {timezone.key}"
        )
    return next(iter(interpretations)).astimezone(UTC)
