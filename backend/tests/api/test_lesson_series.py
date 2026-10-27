from datetime import UTC, datetime, timedelta
from typing import Protocol
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import TokenService, utc_now
from app.models.enums import RoleCode
from app.models.lesson import Lesson
from app.models.profile import Profile
from app.models.role_profiles import StudentProfile, TeacherProfile
from app.models.teacher_student_relation import TeacherStudentRelation
from app.models.user import User

pytestmark = [pytest.mark.asyncio, pytest.mark.postgresql]


class ApiTestContext(Protocol):
    client: httpx.AsyncClient
    session: AsyncSession


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def actor(
    context: ApiTestContext,
    role: RoleCode,
    *,
    timezone: str = "Europe/Moscow",
) -> tuple[User, str]:
    user = User(
        email=f"series-{role.value.lower()}-{uuid4().hex}@example.com",
        password_hash="test-only",
        role=role,
        is_active=True,
    )
    user.profile = Profile(
        first_name=role.value.title(),
        last_name="Series",
        timezone=timezone,
    )
    if role == RoleCode.TEACHER:
        user.teacher_profile = TeacherProfile()
    elif role == RoleCode.STUDENT:
        user.student_profile = StudentProfile()
    context.session.add(user)
    await context.session.commit()
    token = (
        TokenService(get_settings())
        .create_access_token(user_id=user.id, role=role)
        .value
    )
    return user, token


async def participants(
    context: ApiTestContext,
    *,
    timezone: str = "Europe/Moscow",
) -> tuple[User, str, User, str]:
    teacher, teacher_token = await actor(context, RoleCode.TEACHER, timezone=timezone)
    student, student_token = await actor(context, RoleCode.STUDENT)
    context.session.add(
        TeacherStudentRelation(
            teacher_id=teacher.id,
            student_id=student.id,
            created_at=utc_now(),
        )
    )
    await context.session.commit()
    return teacher, teacher_token, student, student_token


def series_payload(
    student_id: UUID,
    *,
    count: int = 4,
    starts_at: datetime | None = None,
    duration_minutes: int = 60,
) -> dict[str, object]:
    return {
        "student_id": str(student_id),
        "title": "  Математика  ",
        "description": "Подготовка к экзамену",
        "starts_at": (starts_at or datetime(2030, 1, 7, 15, tzinfo=UTC)).isoformat(),
        "duration_minutes": duration_minutes,
        "recurrence": "weekly",
        "count": count,
    }


async def teacher_lessons(context: ApiTestContext, teacher_id: UUID) -> list[Lesson]:
    return list(
        (
            await context.session.scalars(
                select(Lesson)
                .where(Lesson.teacher_id == teacher_id)
                .order_by(Lesson.starts_at, Lesson.id)
            )
        ).all()
    )


@pytest.mark.parametrize("count", [2, 4, 52])
async def test_create_weekly_series_is_sorted_and_persisted(
    api_context: ApiTestContext,
    count: int,
) -> None:
    teacher, token, student, _ = await participants(api_context)

    response = await api_context.client.post(
        "/api/v1/lessons/series",
        headers=auth(token),
        json=series_payload(student.id, count=count),
    )
    stored = await teacher_lessons(api_context, teacher.id)

    assert response.status_code == 201
    assert len(response.json()) == len(stored) == count
    assert len({item["id"] for item in response.json()}) == count
    assert [item["starts_at"] for item in response.json()] == sorted(
        item["starts_at"] for item in response.json()
    )
    assert {lesson.student_id for lesson in stored} == {student.id}
    assert {lesson.title for lesson in stored} == {"Математика"}
    assert {lesson.description for lesson in stored} == {"Подготовка к экзамену"}
    assert {lesson.duration_minutes for lesson in stored} == {60}


async def test_series_preserves_new_york_local_hour_across_dst(
    api_context: ApiTestContext,
) -> None:
    timezone = ZoneInfo("America/New_York")
    teacher, token, student, _ = await participants(
        api_context,
        timezone=timezone.key,
    )
    first = datetime(2030, 2, 24, 9, tzinfo=timezone)

    response = await api_context.client.post(
        "/api/v1/lessons/series",
        headers=auth(token),
        json=series_payload(student.id, starts_at=first),
    )
    stored = await teacher_lessons(api_context, teacher.id)
    local = [lesson.starts_at.astimezone(timezone) for lesson in stored]

    assert response.status_code == 201
    assert [(value.weekday(), value.hour) for value in local] == [(6, 9)] * 4
    assert [value.utcoffset() for value in local] == [
        timedelta(hours=-5),
        timedelta(hours=-5),
        timedelta(hours=-4),
        timedelta(hours=-4),
    ]


async def test_existing_conflicts_are_detailed_and_confirmation_creates_all(
    api_context: ApiTestContext,
) -> None:
    teacher, token, student, _ = await participants(api_context)
    other_teacher, _ = await actor(api_context, RoleCode.TEACHER)
    first = datetime(2030, 1, 7, 15, tzinfo=UTC)
    existing = Lesson(
        teacher_id=teacher.id,
        student_id=student.id,
        title="Existing",
        starts_at=first + timedelta(days=7, minutes=30),
        duration_minutes=60,
    )
    cancelled = Lesson(
        teacher_id=teacher.id,
        student_id=student.id,
        title="Cancelled",
        starts_at=first,
        duration_minutes=60,
        cancelled_at=utc_now(),
    )
    foreign = Lesson(
        teacher_id=other_teacher.id,
        student_id=student.id,
        title="Foreign",
        starts_at=first + timedelta(days=14),
        duration_minutes=60,
    )
    api_context.session.add_all([existing, cancelled, foreign])
    await api_context.session.commit()
    teacher_id = teacher.id
    existing_id = existing.id
    payload = series_payload(student.id)

    warning = await api_context.client.post(
        "/api/v1/lessons/series", headers=auth(token), json=payload
    )
    before_confirmation = await teacher_lessons(api_context, teacher_id)
    confirmed = await api_context.client.post(
        "/api/v1/lessons/series",
        headers=auth(token),
        json={**payload, "confirm_conflict": True},
    )

    assert warning.status_code == 409
    assert warning.json()["error"]["code"] == "lesson_time_conflict"
    conflicts = warning.json()["error"]["context"]["conflicts"]
    assert len(conflicts) == 1
    assert conflicts[0]["type"] == "existing_lesson"
    assert conflicts[0]["series_index"] == 1
    assert conflicts[0]["series_number"] == 2
    assert conflicts[0]["lesson"]["id"] == str(existing_id)
    assert len(before_confirmation) == 2
    assert confirmed.status_code == 201
    assert len(confirmed.json()) == 4


async def test_within_series_conflicts_use_warning_flow(
    api_context: ApiTestContext,
) -> None:
    teacher, token, student, _ = await participants(api_context)
    teacher_id = teacher.id
    payload = series_payload(student.id, count=3, duration_minutes=7 * 24 * 60 + 1)

    warning = await api_context.client.post(
        "/api/v1/lessons/series", headers=auth(token), json=payload
    )
    stored_after_warning = await teacher_lessons(api_context, teacher_id)
    confirmed = await api_context.client.post(
        "/api/v1/lessons/series",
        headers=auth(token),
        json={**payload, "confirm_conflict": True},
    )

    assert warning.status_code == 409
    conflicts = warning.json()["error"]["context"]["conflicts"]
    assert [(item["series_index"], item["other_series_index"]) for item in conflicts] == [
        (0, 1),
        (1, 2),
    ]
    assert stored_after_warning == []
    assert confirmed.status_code == 201
    assert len(confirmed.json()) == 3


@pytest.mark.parametrize(
    "changes",
    [
        {"count": 1},
        {"count": 53},
        {"count": 2.0},
        {"recurrence": "daily"},
        {"starts_at": "2030-01-07T15:00:00"},
        {"teacher_id": str(uuid4())},
        {"unexpected": True},
    ],
)
async def test_series_request_validation_creates_nothing(
    api_context: ApiTestContext,
    changes: dict[str, object],
) -> None:
    teacher, token, student, _ = await participants(api_context)

    response = await api_context.client.post(
        "/api/v1/lessons/series",
        headers=auth(token),
        json={**series_payload(student.id), **changes},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert await teacher_lessons(api_context, teacher.id) == []


async def test_series_enforces_authentication_role_and_student_access(
    api_context: ApiTestContext,
) -> None:
    teacher, token, student, student_token = await participants(api_context)
    teacher_id = teacher.id
    unavailable, _ = await actor(api_context, RoleCode.STUDENT)

    anonymous = await api_context.client.post(
        "/api/v1/lessons/series", json=series_payload(student.id)
    )
    forbidden = await api_context.client.post(
        "/api/v1/lessons/series",
        headers=auth(student_token),
        json=series_payload(student.id),
    )
    inaccessible = await api_context.client.post(
        "/api/v1/lessons/series",
        headers=auth(token),
        json=series_payload(unavailable.id),
    )

    assert anonymous.status_code == 401
    assert forbidden.status_code == 403
    assert inaccessible.status_code == 404
    assert inaccessible.json()["error"]["code"] == "student_not_available"
    assert await teacher_lessons(api_context, teacher_id) == []


@pytest.mark.parametrize(
    ("timezone", "first"),
    [
        ("Invalid/Timezone", datetime(2030, 1, 7, 15, tzinfo=UTC)),
        (
            "America/New_York",
            datetime(2030, 3, 10, 2, 30, tzinfo=ZoneInfo("America/New_York")),
        ),
    ],
)
async def test_invalid_profile_timezone_or_local_time_is_controlled(
    api_context: ApiTestContext,
    timezone: str,
    first: datetime,
) -> None:
    teacher, token, student, _ = await participants(api_context, timezone=timezone)
    teacher_id = teacher.id

    response = await api_context.client.post(
        "/api/v1/lessons/series",
        headers=auth(token),
        json=series_payload(student.id, starts_at=first),
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "lesson_series_time_invalid"
    assert await teacher_lessons(api_context, teacher_id) == []


async def test_series_rolls_back_all_lessons_when_commit_fails(
    api_context: ApiTestContext,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    teacher, token, student, _ = await participants(api_context)
    teacher_id = teacher.id

    async def broken_commit() -> None:
        raise RuntimeError("Simulated series commit failure")

    monkeypatch.setattr(api_context.session, "commit", broken_commit)
    with pytest.raises(RuntimeError, match="Simulated series commit failure"):
        await api_context.client.post(
            "/api/v1/lessons/series",
            headers=auth(token),
            json=series_payload(student.id),
        )

    count = await api_context.session.scalar(
        select(func.count()).select_from(Lesson).where(Lesson.teacher_id == teacher_id)
    )
    assert count == 0


async def test_series_is_visible_to_both_users_and_single_create_still_works(
    api_context: ApiTestContext,
) -> None:
    teacher, token, student, student_token = await participants(api_context)
    payload = series_payload(student.id, count=2)

    created = await api_context.client.post(
        "/api/v1/lessons/series", headers=auth(token), json=payload
    )
    teacher_search = await api_context.client.post(
        "/api/v1/lessons/search", headers=auth(token), json={}
    )
    student_search = await api_context.client.post(
        "/api/v1/lessons/search", headers=auth(student_token), json={}
    )
    single = await api_context.client.post(
        "/api/v1/lessons",
        headers=auth(token),
        json={
            "student_id": str(student.id),
            "title": "Single",
            "starts_at": datetime(2030, 2, 1, 15, tzinfo=UTC).isoformat(),
            "duration_minutes": 60,
        },
    )

    assert created.status_code == single.status_code == 201
    assert [item["id"] for item in teacher_search.json()] == [
        item["id"] for item in student_search.json()
    ] == [item["id"] for item in created.json()]
