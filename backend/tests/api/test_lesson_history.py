from datetime import UTC, datetime, timedelta
from typing import Protocol
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import event
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import TokenService
from app.models.enums import AttendanceValue, RelationStatus, RoleCode
from app.models.lesson import Lesson
from app.models.profile import Profile
from app.models.role_profiles import StudentProfile, TeacherProfile
from app.models.teacher_student_relation import TeacherStudentRelation
from app.models.user import User

pytestmark = [pytest.mark.asyncio, pytest.mark.postgresql]


class ApiTestContext(Protocol):
    client: httpx.AsyncClient
    session: AsyncSession


async def actor(context: ApiTestContext, role: RoleCode) -> tuple[User, str]:
    user = User(
        email=f"history-{role.value.lower()}-{uuid4().hex}@example.com",
        password_hash="test-only",
        role=role,
        is_active=True,
    )
    user.profile = Profile(
        first_name=role.value.title(),
        last_name="History",
        timezone="Europe/Moscow",
    )
    if role == RoleCode.TEACHER:
        user.teacher_profile = TeacherProfile()
    elif role == RoleCode.STUDENT:
        user.student_profile = StudentProfile()
    context.session.add(user)
    await context.session.commit()
    token = TokenService(get_settings()).create_access_token(user_id=user.id, role=role).value
    return user, token


async def connect(
    context: ApiTestContext,
    teacher: User,
    student: User,
    *,
    status: RelationStatus = RelationStatus.ACTIVE,
) -> None:
    context.session.add(
        TeacherStudentRelation(
            teacher_id=teacher.id,
            student_id=student.id,
            created_at=datetime.now(UTC),
            status=status,
            deactivated_at=datetime.now(UTC) if status == RelationStatus.INACTIVE else None,
        )
    )
    await context.session.commit()


def authorization(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def period(start: datetime, end: datetime) -> dict[str, str]:
    return {"date_from": start.isoformat(), "date_to": end.isoformat()}


def path(student: User) -> str:
    return f"/api/v1/teachers/me/students/{student.id}/lesson-history"


async def test_history_returns_current_states_and_consistent_aggregates(
    api_context: ApiTestContext,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    teacher, token = await actor(api_context, RoleCode.TEACHER)
    other_teacher, _ = await actor(api_context, RoleCode.TEACHER)
    student, _ = await actor(api_context, RoleCode.STUDENT)
    other_student, _ = await actor(api_context, RoleCode.STUDENT)
    await connect(api_context, teacher, student)
    now = datetime(2030, 1, 10, 12, tzinfo=UTC)
    monkeypatch.setattr("app.api.routes.teachers.utc_now", lambda: now)

    def lesson(
        title: str,
        starts_at: datetime,
        *,
        attendance: AttendanceValue | None = None,
        cancelled: bool = False,
        owner: User = teacher,
        learner: User = student,
    ) -> Lesson:
        return Lesson(
            teacher_id=owner.id,
            student_id=learner.id,
            title=title,
            starts_at=starts_at,
            duration_minutes=60,
            attendance=attendance,
            attendance_updated_at=now if attendance is not None else None,
            cancelled_at=now - timedelta(days=1) if cancelled else None,
        )

    expected = [
        lesson("Present", now - timedelta(days=6), attendance=AttendanceValue.PRESENT),
        lesson("Absent", now - timedelta(days=5), attendance=AttendanceValue.ABSENT),
        lesson("Unmarked", now - timedelta(days=4)),
        lesson(
            "Cancelled",
            now - timedelta(days=3),
            attendance=AttendanceValue.PRESENT,
            cancelled=True,
        ),
        lesson("In progress", now - timedelta(minutes=30)),
        lesson("Planned", now + timedelta(days=1)),
    ]
    api_context.session.add_all(
        [
            *expected,
            lesson("Foreign teacher", now - timedelta(days=2), owner=other_teacher),
            lesson("Foreign student", now - timedelta(days=2), learner=other_student),
        ]
    )
    await api_context.session.commit()

    response = await api_context.client.get(
        path(student),
        headers=authorization(token),
        params=period(now - timedelta(days=7), now + timedelta(days=2)),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["student_id"] == str(student.id)
    assert [row["id"] for row in payload["history"]] == [str(row.id) for row in expected]
    assert [row["status"] for row in payload["history"]] == [
        "completed",
        "completed",
        "completed",
        "cancelled",
        "in_progress",
        "planned",
    ]
    assert [row["attendance"] for row in payload["history"]] == [
        "present",
        "absent",
        "not_set",
        "present",
        "not_set",
        "not_set",
    ]
    assert set(payload["history"][0]) == {
        "id",
        "title",
        "starts_at",
        "ends_at",
        "status",
        "attendance",
    }
    assert payload["aggregates"] == {
        "total_lessons": 6,
        "completed_lessons": 3,
        "attended_lessons": 1,
        "missed_lessons": 1,
        "unmarked_lessons": 1,
        "cancelled_lessons": 1,
        "attendance_rate": 50.0,
    }


async def test_history_enforces_authentication_role_and_active_ownership(
    api_context: ApiTestContext,
) -> None:
    owner, owner_token = await actor(api_context, RoleCode.TEACHER)
    stranger, stranger_token = await actor(api_context, RoleCode.TEACHER)
    inactive_teacher, inactive_token = await actor(api_context, RoleCode.TEACHER)
    student, student_token = await actor(api_context, RoleCode.STUDENT)
    _, admin_token = await actor(api_context, RoleCode.ADMIN)
    await connect(api_context, owner, student)
    await connect(
        api_context,
        inactive_teacher,
        student,
        status=RelationStatus.INACTIVE,
    )
    query = period(datetime(2030, 1, 1, tzinfo=UTC), datetime(2030, 2, 1, tzinfo=UTC))

    owner_response = await api_context.client.get(
        path(student), headers=authorization(owner_token), params=query
    )
    stranger_response = await api_context.client.get(
        path(student), headers=authorization(stranger_token), params=query
    )
    inactive_response = await api_context.client.get(
        path(student), headers=authorization(inactive_token), params=query
    )
    student_response = await api_context.client.get(
        path(student), headers=authorization(student_token), params=query
    )
    admin_response = await api_context.client.get(
        path(student), headers=authorization(admin_token), params=query
    )
    anonymous_response = await api_context.client.get(path(student), params=query)
    malformed_response = await api_context.client.get(
        "/api/v1/teachers/me/students/not-a-uuid/lesson-history",
        headers=authorization(owner_token),
        params=query,
    )

    assert owner_response.status_code == 200
    for response in (stranger_response, inactive_response):
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "connection_not_found"
    for response in (student_response, admin_response):
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "forbidden"
    assert anonymous_response.status_code == 401
    assert anonymous_response.json()["error"]["code"] == "authentication_required"
    assert malformed_response.status_code == 422
    assert malformed_response.json()["error"]["code"] == "validation_error"


async def test_history_period_is_half_open_and_timezone_aware(
    api_context: ApiTestContext,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    teacher, token = await actor(api_context, RoleCode.TEACHER)
    student, _ = await actor(api_context, RoleCode.STUDENT)
    await connect(api_context, teacher, student)
    lower = datetime(2030, 1, 1, 18, 30, tzinfo=UTC)
    upper = lower + timedelta(hours=1)
    starts = [
        lower - timedelta(microseconds=1),
        lower,
        lower + timedelta(minutes=30),
        upper - timedelta(microseconds=1),
        upper,
    ]
    lessons = [
        Lesson(
            teacher_id=teacher.id,
            student_id=student.id,
            title=f"Boundary {index}",
            starts_at=start,
            duration_minutes=120 if index == 0 else 60,
        )
        for index, start in enumerate(starts)
    ]
    api_context.session.add_all(lessons)
    await api_context.session.commit()
    monkeypatch.setattr("app.api.routes.teachers.utc_now", lambda: upper + timedelta(days=1))

    response = await api_context.client.get(
        path(student),
        headers=authorization(token),
        params={
            "date_from": "2030-01-01T23:30:00+05:00",
            "date_to": "2030-01-02T00:30:00+05:00",
        },
    )

    assert response.status_code == 200
    assert [row["id"] for row in response.json()["history"]] == [
        str(lessons[1].id),
        str(lessons[2].id),
        str(lessons[3].id),
    ]
    assert response.json()["aggregates"]["total_lessons"] == 3


@pytest.mark.parametrize(
    "params",
    [
        {},
        {"date_from": "2030-01-01T00:00:00Z"},
        {"date_to": "2030-01-02T00:00:00Z"},
        {"date_from": "2030-01-01T00:00:00", "date_to": "2030-01-02T00:00:00Z"},
        {"date_from": "invalid", "date_to": "2030-01-02T00:00:00Z"},
        {
            "date_from": "2030-01-02T00:00:00Z",
            "date_to": "2030-01-02T00:00:00Z",
        },
        {
            "date_from": "2030-01-03T00:00:00Z",
            "date_to": "2030-01-02T00:00:00Z",
        },
        {
            "date_from": "2030-01-01T00:00:00Z",
            "date_to": "2030-01-02T00:00:00Z",
            "teacher_id": str(uuid4()),
        },
    ],
)
async def test_history_rejects_invalid_periods(
    api_context: ApiTestContext,
    params: dict[str, str],
) -> None:
    teacher, token = await actor(api_context, RoleCode.TEACHER)
    student, _ = await actor(api_context, RoleCode.STUDENT)
    response = await api_context.client.get(
        path(student), headers=authorization(token), params=params
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


async def test_empty_history_has_zero_counts_and_null_rate(
    api_context: ApiTestContext,
) -> None:
    teacher, token = await actor(api_context, RoleCode.TEACHER)
    student, _ = await actor(api_context, RoleCode.STUDENT)
    await connect(api_context, teacher, student)

    response = await api_context.client.get(
        path(student),
        headers=authorization(token),
        params=period(datetime(2030, 1, 1, tzinfo=UTC), datetime(2030, 2, 1, tzinfo=UTC)),
    )

    assert response.status_code == 200
    assert response.json()["history"] == []
    assert response.json()["aggregates"] == {
        "total_lessons": 0,
        "completed_lessons": 0,
        "attended_lessons": 0,
        "missed_lessons": 0,
        "unmarked_lessons": 0,
        "cancelled_lessons": 0,
        "attendance_rate": None,
    }


async def test_history_query_count_is_constant_for_typical_volume(
    api_context: ApiTestContext,
) -> None:
    teacher, token = await actor(api_context, RoleCode.TEACHER)
    student, _ = await actor(api_context, RoleCode.STUDENT)
    await connect(api_context, teacher, student)
    start = datetime(2029, 1, 1, tzinfo=UTC)
    api_context.session.add_all(
        [
            Lesson(
                teacher_id=teacher.id,
                student_id=student.id,
                title=f"History {index}",
                starts_at=start + timedelta(days=index),
                duration_minutes=60,
            )
            for index in range(100)
        ]
    )
    await api_context.session.commit()
    statements = 0

    def count_statement(
        _connection: Connection,
        _cursor: object,
        _statement: str,
        _parameters: object,
        _context: object,
        _executemany: bool,
    ) -> None:
        nonlocal statements
        statements += 1

    bind = api_context.session.sync_session.get_bind()
    event.listen(bind, "before_cursor_execute", count_statement)
    try:
        response = await api_context.client.get(
            path(student),
            headers=authorization(token),
            params=period(start, start + timedelta(days=100)),
        )
    finally:
        event.remove(bind, "before_cursor_execute", count_statement)

    assert response.status_code == 200
    assert len(response.json()["history"]) == 100
    # Authentication/profile loading, ownership and history stay constant as rows grow.
    assert statements <= 5


async def test_history_uses_one_current_time_for_all_rows(
    api_context: ApiTestContext,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    teacher, token = await actor(api_context, RoleCode.TEACHER)
    student, _ = await actor(api_context, RoleCode.STUDENT)
    await connect(api_context, teacher, student)
    starts_at = datetime(2030, 1, 2, 12, tzinfo=UTC)
    api_context.session.add_all(
        [
            Lesson(
                teacher_id=teacher.id,
                student_id=student.id,
                title=title,
                starts_at=starts_at,
                duration_minutes=60,
            )
            for title in ("First", "Second")
        ]
    )
    await api_context.session.commit()
    calls = 0

    def changing_now() -> datetime:
        nonlocal calls
        calls += 1
        return starts_at - timedelta(microseconds=1) if calls == 1 else starts_at

    monkeypatch.setattr(
        "app.api.routes.teachers.utc_now",
        changing_now,
    )
    response = await api_context.client.get(
        path(student),
        headers=authorization(token),
        params=period(starts_at - timedelta(days=1), starts_at + timedelta(days=1)),
    )

    assert response.status_code == 200
    assert calls == 1
    assert [row["status"] for row in response.json()["history"]] == ["planned", "planned"]
