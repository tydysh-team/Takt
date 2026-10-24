from datetime import UTC, datetime, timedelta
from typing import Protocol
from uuid import UUID, uuid4

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import TokenService, utc_now
from app.models.enums import AttendanceValue, RoleCode
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


async def actor(context: ApiTestContext, role: RoleCode) -> tuple[UUID, str]:
    user = User(
        email=f"attendance-{role.lower()}-{uuid4().hex}@example.com",
        password_hash="test-only",
        role=role,
        is_active=True,
    )
    user.profile = Profile(first_name=role.title(), last_name="Example", timezone="Europe/Moscow")
    if role == RoleCode.TEACHER:
        user.teacher_profile = TeacherProfile()
    elif role == RoleCode.STUDENT:
        user.student_profile = StudentProfile()
    context.session.add(user)
    await context.session.commit()
    token = TokenService(get_settings()).create_access_token(user_id=user.id, role=role).value
    return user.id, token


async def participants(context: ApiTestContext) -> tuple[UUID, str, UUID, str]:
    teacher_id, teacher_token = await actor(context, RoleCode.TEACHER)
    student_id, student_token = await actor(context, RoleCode.STUDENT)
    context.session.add(
        TeacherStudentRelation(
            teacher_id=teacher_id,
            student_id=student_id,
            created_at=utc_now(),
        )
    )
    await context.session.commit()
    return teacher_id, teacher_token, student_id, student_token


async def store_lesson(
    context: ApiTestContext,
    teacher_id: UUID,
    student_id: UUID,
    starts_at: datetime,
    *,
    attendance: AttendanceValue | None = None,
    attendance_updated_at: datetime | None = None,
    cancelled_at: datetime | None = None,
    rescheduled_at: datetime | None = None,
) -> Lesson:
    lesson = Lesson(
        teacher_id=teacher_id,
        student_id=student_id,
        title="Attendance lesson",
        starts_at=starts_at,
        duration_minutes=60,
        attendance=attendance,
        attendance_updated_at=attendance_updated_at,
        cancelled_at=cancelled_at,
        rescheduled_at=rescheduled_at,
    )
    context.session.add(lesson)
    await context.session.commit()
    return lesson


def freeze_time(monkeypatch: pytest.MonkeyPatch, now: datetime) -> None:
    monkeypatch.setattr("app.services.lessons.utc_now", lambda: now)
    monkeypatch.setattr("app.api.routes.lessons.utc_now", lambda: now)


async def test_new_lesson_has_not_set_attendance(api_context: ApiTestContext) -> None:
    _, token, student_id, _ = await participants(api_context)
    created = await api_context.client.post(
        "/api/v1/lessons",
        headers=auth(token),
        json={
            "student_id": str(student_id),
            "title": "New lesson",
            "starts_at": (utc_now() + timedelta(days=2)).isoformat(),
            "duration_minutes": 60,
        },
    )
    assert created.status_code == 201
    assert created.json()["attendance"] == "not_set"
    lesson_get = await api_context.client.get(
        f"/api/v1/lessons/{created.json()['id']}", headers=auth(token)
    )
    assert lesson_get.status_code == 200
    assert lesson_get.json()["attendance"] == "not_set"


@pytest.mark.parametrize(
    ("previous", "requested"),
    [
        (None, "present"),
        (None, "absent"),
        (AttendanceValue.PRESENT, "absent"),
        (AttendanceValue.ABSENT, "present"),
    ],
)
async def test_attendance_changes_are_persisted_and_lesson_scoped(
    api_context: ApiTestContext,
    monkeypatch: pytest.MonkeyPatch,
    previous: AttendanceValue | None,
    requested: str,
) -> None:
    teacher_id, token, student_id, student_token = await participants(api_context)
    now = datetime(2030, 1, 1, 12, tzinfo=UTC)
    freeze_time(monkeypatch, now)
    old_updated_at = now - timedelta(hours=2) if previous is not None else None
    lesson = await store_lesson(
        api_context,
        teacher_id,
        student_id,
        now - timedelta(minutes=30),
        attendance=previous,
        attendance_updated_at=old_updated_at,
    )
    other = await store_lesson(api_context, teacher_id, student_id, now - timedelta(days=1))
    lesson_id, other_id = lesson.id, other.id

    response = await api_context.client.put(
        f"/api/v1/lessons/{lesson_id}/attendance",
        headers=auth(token),
        json={"attendance": requested},
    )
    student_get = await api_context.client.get(
        f"/api/v1/lessons/{lesson_id}", headers=auth(student_token)
    )
    search = await api_context.client.post(
        "/api/v1/lessons/search", headers=auth(student_token), json={}
    )
    await api_context.session.refresh(lesson)
    await api_context.session.refresh(other)

    assert response.status_code == 200
    assert response.json()["attendance"] == requested
    assert response.json()["status"] == "in_progress"
    assert student_get.json()["attendance"] == requested
    searched_lesson = next(item for item in search.json() if item["id"] == str(lesson_id))
    assert searched_lesson["attendance"] == requested
    assert lesson.attendance == AttendanceValue(requested.upper())
    assert lesson.attendance_updated_at == now
    assert other.id == other_id
    assert other.attendance is None
    assert other.attendance_updated_at is None


@pytest.mark.parametrize("value", ["present", "absent"])
async def test_repeating_same_attendance_keeps_original_timestamp(
    api_context: ApiTestContext,
    monkeypatch: pytest.MonkeyPatch,
    value: str,
) -> None:
    teacher_id, token, student_id, _ = await participants(api_context)
    now = datetime(2030, 1, 1, 12, tzinfo=UTC)
    freeze_time(monkeypatch, now)
    original_timestamp = now - timedelta(days=1)
    lesson = await store_lesson(
        api_context,
        teacher_id,
        student_id,
        now - timedelta(hours=2),
        attendance=AttendanceValue(value.upper()),
        attendance_updated_at=original_timestamp,
    )
    response = await api_context.client.put(
        f"/api/v1/lessons/{lesson.id}/attendance",
        headers=auth(token),
        json={"attendance": value},
    )
    await api_context.session.refresh(lesson)
    assert response.status_code == 200
    assert response.json()["attendance"] == value
    assert lesson.attendance_updated_at == original_timestamp


@pytest.mark.parametrize(
    ("start_offset", "expected_status", "expected_http"),
    [
        (timedelta(microseconds=1), "planned", 409),
        (timedelta(), "in_progress", 200),
        (-timedelta(minutes=30), "in_progress", 200),
        (-timedelta(minutes=60), "completed", 200),
        (-timedelta(hours=2), "completed", 200),
    ],
)
async def test_attendance_lifecycle_boundaries(
    api_context: ApiTestContext,
    monkeypatch: pytest.MonkeyPatch,
    start_offset: timedelta,
    expected_status: str,
    expected_http: int,
) -> None:
    teacher_id, token, student_id, _ = await participants(api_context)
    now = datetime(2030, 1, 1, 12, tzinfo=UTC)
    freeze_time(monkeypatch, now)
    lesson = await store_lesson(api_context, teacher_id, student_id, now + start_offset)
    response = await api_context.client.put(
        f"/api/v1/lessons/{lesson.id}/attendance",
        headers=auth(token),
        json={"attendance": "present"},
    )
    await api_context.session.refresh(lesson)
    assert response.status_code == expected_http
    if expected_http == 200:
        assert response.json()["status"] == expected_status
        assert lesson.attendance == AttendanceValue.PRESENT
        assert lesson.attendance_updated_at == now
    else:
        assert response.json()["error"]["code"] == "attendance_not_available"
        assert lesson.attendance is None
        assert lesson.attendance_updated_at is None


@pytest.mark.parametrize(
    ("start_offset", "cancelled", "allowed"),
    [
        (timedelta(hours=1), False, False),
        (-timedelta(minutes=30), False, True),
        (-timedelta(minutes=30), True, False),
    ],
)
async def test_rescheduled_and_cancelled_lesson_use_current_lifecycle(
    api_context: ApiTestContext,
    monkeypatch: pytest.MonkeyPatch,
    start_offset: timedelta,
    cancelled: bool,
    allowed: bool,
) -> None:
    teacher_id, token, student_id, _ = await participants(api_context)
    now = datetime(2030, 1, 1, 12, tzinfo=UTC)
    freeze_time(monkeypatch, now)
    lesson = await store_lesson(
        api_context,
        teacher_id,
        student_id,
        now + start_offset,
        cancelled_at=now - timedelta(hours=2) if cancelled else None,
        rescheduled_at=now - timedelta(days=1),
    )
    response = await api_context.client.put(
        f"/api/v1/lessons/{lesson.id}/attendance",
        headers=auth(token),
        json={"attendance": "absent"},
    )
    await api_context.session.refresh(lesson)
    assert response.status_code == (200 if allowed else 409)
    if allowed:
        assert response.json()["is_rescheduled"] is True
        assert response.json()["attendance"] == "absent"
    else:
        assert response.json()["error"]["code"] == "attendance_not_available"
        assert lesson.attendance is None


async def test_attendance_private_not_found_and_role_access(api_context: ApiTestContext) -> None:
    teacher_id, token, student_id, student_token = await participants(api_context)
    _, other_teacher_token = await actor(api_context, RoleCode.TEACHER)
    lesson = await store_lesson(api_context, teacher_id, student_id, utc_now() - timedelta(days=1))
    path = f"/api/v1/lessons/{lesson.id}/attendance"
    body = {"attendance": "present"}
    foreign = await api_context.client.put(path, headers=auth(other_teacher_token), json=body)
    missing = await api_context.client.put(
        f"/api/v1/lessons/{uuid4()}/attendance", headers=auth(token), json=body
    )
    student = await api_context.client.put(path, headers=auth(student_token), json=body)
    anonymous = await api_context.client.put(path, json=body)
    await api_context.session.refresh(lesson)

    assert foreign.status_code == missing.status_code == 404
    assert foreign.json()["error"]["code"] == missing.json()["error"]["code"] == "lesson_not_found"
    assert student.status_code == 403
    assert anonymous.status_code == 401
    assert lesson.attendance is None


@pytest.mark.parametrize(
    "body",
    [
        {"attendance": "not_set"},
        {"attendance": "unknown"},
        {"attendance": None},
        {"attendance": "present", "teacher_id": str(uuid4())},
        {"attendance": "present", "student_id": str(uuid4())},
        {"attendance": "present", "extra": True},
        {},
    ],
)
async def test_attendance_rejects_invalid_request(
    api_context: ApiTestContext,
    body: dict[str, object],
) -> None:
    teacher_id, token, student_id, _ = await participants(api_context)
    lesson = await store_lesson(api_context, teacher_id, student_id, utc_now() - timedelta(days=1))
    response = await api_context.client.put(
        f"/api/v1/lessons/{lesson.id}/attendance", headers=auth(token), json=body
    )
    await api_context.session.refresh(lesson)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert lesson.attendance is None


async def test_attendance_rolls_back_on_commit_error(
    api_context: ApiTestContext,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    teacher_id, token, student_id, _ = await participants(api_context)
    original_timestamp = utc_now() - timedelta(days=2)
    lesson = await store_lesson(
        api_context,
        teacher_id,
        student_id,
        utc_now() - timedelta(days=1),
        attendance=AttendanceValue.PRESENT,
        attendance_updated_at=original_timestamp,
    )
    path = f"/api/v1/lessons/{lesson.id}/attendance"

    async def broken_commit() -> None:
        raise RuntimeError("Simulated commit failure")

    monkeypatch.setattr(api_context.session, "commit", broken_commit)
    with pytest.raises(RuntimeError, match="Simulated commit failure"):
        await api_context.client.put(path, headers=auth(token), json={"attendance": "absent"})
    await api_context.session.refresh(lesson)
    assert lesson.attendance == AttendanceValue.PRESENT
    assert lesson.attendance_updated_at == original_timestamp
