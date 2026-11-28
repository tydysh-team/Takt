from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import BaseModel, ValidationError

from app.schemas.lessons import (
    LessonCancelRequest,
    LessonCreate,
    LessonRescheduleRequest,
    LessonSeriesCreate,
)


def lesson_fields() -> dict[str, object]:
    return {
        "student_id": uuid4(),
        "title": "T" * 120,
        "description": "D" * 2000,
        "starts_at": datetime(2030, 1, 1, 12, tzinfo=UTC),
        "duration_minutes": 2147483647,
    }


def test_create_accepts_exact_text_and_duration_limits() -> None:
    request = LessonCreate.model_validate(lesson_fields())

    assert len(request.title) == 120
    assert len(request.description or "") == 2000
    assert request.duration_minutes == 2147483647


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("title", "T" * 121),
        ("description", "D" * 2001),
        ("duration_minutes", 0),
        ("duration_minutes", 2147483648),
        ("duration_minutes", True),
        ("starts_at", datetime(2030, 1, 1, 12)),
    ],
)
def test_create_rejects_invalid_boundaries(field: str, value: object) -> None:
    with pytest.raises(ValidationError):
        LessonCreate.model_validate({**lesson_fields(), field: value})


@pytest.mark.parametrize("raw", ["", "  ", "\t\n", None])
def test_cancel_blank_reason_becomes_null(raw: str | None) -> None:
    assert LessonCancelRequest(reason=raw).reason is None


def test_cancel_reason_limit_applies_after_trimming() -> None:
    assert LessonCancelRequest(reason="  " + "R" * 500 + "  ").reason == "R" * 500
    with pytest.raises(ValidationError):
        LessonCancelRequest(reason="R" * 501)


@pytest.mark.parametrize("request_type", [LessonCreate, LessonRescheduleRequest])
def test_schedule_requests_require_timezone(request_type: type[BaseModel]) -> None:
    fields = lesson_fields() if request_type is LessonCreate else {}
    with pytest.raises(ValidationError):
        request_type.model_validate({**fields, "starts_at": datetime(2030, 1, 1, 12)})


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("count", 1),
        ("count", 53),
        ("count", 2.0),
        ("count", True),
        ("recurrence", "daily"),
    ],
)
def test_series_rejects_invalid_recurrence_and_count(field: str, value: object) -> None:
    with pytest.raises(ValidationError):
        LessonSeriesCreate.model_validate(
            {**lesson_fields(), "recurrence": "weekly", "count": 4, field: value}
        )


def test_series_defaults_conflict_confirmation_and_forbids_owner() -> None:
    request = LessonSeriesCreate.model_validate(
        {**lesson_fields(), "recurrence": "weekly", "count": 4}
    )
    assert request.confirm_conflict is False
    with pytest.raises(ValidationError):
        LessonSeriesCreate.model_validate(
            {
                **lesson_fields(),
                "recurrence": "weekly",
                "count": 4,
                "teacher_id": uuid4(),
            }
        )


@pytest.mark.parametrize("request_type", [LessonCreate, LessonSeriesCreate])
def test_participant_list_validation_and_legacy_compatibility(request_type) -> None:
    fields = lesson_fields()
    if request_type is LessonSeriesCreate:
        fields.update(recurrence="weekly", count=3)
    legacy = request_type.model_validate(fields)
    assert legacy.participant_ids == [fields["student_id"]]
    fields.pop("student_id")
    ids = [uuid4(), uuid4()]
    assert request_type.model_validate({**fields, "student_ids": ids}).participant_ids == ids
    assert (
        request_type.model_validate({**fields, "student_ids": ids[:1]}).participant_ids == ids[:1]
    )
    for invalid in [
        {},
        {"student_ids": []},
        {"student_ids": [ids[0], ids[0]]},
        {"student_id": ids[0], "student_ids": ids},
        {"student_id": None, "student_ids": ids},
        {"student_ids": None},
    ]:
        with pytest.raises(ValidationError):
            request_type.model_validate({**fields, **invalid})
