from datetime import datetime, timedelta
from typing import Protocol
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.inspection import inspect

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


async def actor(context: ApiTestContext, role: RoleCode) -> tuple[User, str]:
    user = User(
        email=f"{role.lower()}-{uuid4().hex}@example.com",
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
    return user, token


async def connect(context: ApiTestContext, teacher: User, student: User) -> None:
    context.session.add(
        TeacherStudentRelation(
            teacher_id=teacher.id,
            student_id=student.id,
            created_at=utc_now(),
        )
    )
    await context.session.commit()


async def participants(context: ApiTestContext) -> tuple[User, str, User, str]:
    teacher, teacher_token = await actor(context, RoleCode.TEACHER)
    student, student_token = await actor(context, RoleCode.STUDENT)
    await connect(context, teacher, student)
    return teacher, teacher_token, student, student_token


def payload(student: User, starts_at: datetime, *, duration: int = 60) -> dict[str, object]:
    return {
        "student_id": str(inspect(student).identity[0]),
        "title": "Математика",
        "description": "Тема урока",
        "starts_at": starts_at.isoformat(),
        "duration_minutes": duration,
    }


async def store_lesson(
    context: ApiTestContext,
    teacher: User,
    student: User,
    starts_at: datetime,
    *,
    cancelled_at: datetime | None = None,
) -> Lesson:
    lesson = Lesson(
        teacher_id=teacher.id,
        student_id=student.id,
        title="История",
        description="Тема",
        starts_at=starts_at,
        duration_minutes=60,
        cancelled_at=cancelled_at,
    )
    context.session.add(lesson)
    await context.session.commit()
    return lesson


@pytest.mark.parametrize(
    ("start_offset", "duration", "conflict"),
    [
        (30, 60, True),
        (15, 30, True),
        (-30, 120, True),
        (0, 60, True),
        (60, 60, False),
        (-60, 60, False),
    ],
)
async def test_create_conflict_boundaries(
    api_context: ApiTestContext,
    start_offset: int,
    duration: int,
    conflict: bool,
) -> None:
    teacher, token, student, _ = await participants(api_context)
    start = utc_now() + timedelta(days=30)
    existing = await store_lesson(api_context, teacher, student, start)
    existing_id = existing.id
    student_id = student.id
    response = await api_context.client.post(
        "/api/v1/lessons",
        headers=auth(token),
        json=payload(student, start + timedelta(minutes=start_offset), duration=duration),
    )

    assert response.status_code == (409 if conflict else 201)
    if conflict:
        assert response.json()["error"]["code"] == "lesson_time_conflict"
        assert response.json()["error"]["details"] == []
        item = response.json()["error"]["context"]["conflicts"][0]
        assert item["id"] == str(existing_id)
        assert item["title"] == "История"
        assert item["duration_minutes"] == 60
        assert item["student"]["id"] == str(student_id)
        assert datetime.fromisoformat(item["starts_at"]) == start
        assert datetime.fromisoformat(item["ends_at"]) == start + timedelta(hours=1)


async def test_conflict_lists_all_lessons_and_confirmation_creates(
    api_context: ApiTestContext,
) -> None:
    teacher, token, student, _ = await participants(api_context)
    start = utc_now() + timedelta(days=30)
    first = await store_lesson(api_context, teacher, student, start)
    second = await store_lesson(api_context, teacher, student, start + timedelta(minutes=15))
    expected_ids = [str(first.id), str(second.id)]
    proposed = payload(student, start + timedelta(minutes=30))

    warning = await api_context.client.post("/api/v1/lessons", headers=auth(token), json=proposed)
    count_before = len((await api_context.session.scalars(select(Lesson))).all())
    confirmed = await api_context.client.post(
        "/api/v1/lessons",
        headers=auth(token),
        json={**proposed, "confirm_conflict": True},
    )
    count_after = len((await api_context.session.scalars(select(Lesson))).all())

    assert warning.status_code == 409
    assert [item["id"] for item in warning.json()["error"]["context"]["conflicts"]] == expected_ids
    assert count_before == 2
    assert confirmed.status_code == 201
    assert count_after == 3


async def test_cancelled_and_other_teacher_do_not_conflict(api_context: ApiTestContext) -> None:
    teacher, token, student, _ = await participants(api_context)
    other_teacher, _ = await actor(api_context, RoleCode.TEACHER)
    start = utc_now() + timedelta(days=30)
    await store_lesson(api_context, teacher, student, start, cancelled_at=utc_now())
    await store_lesson(api_context, other_teacher, student, start)

    response = await api_context.client.post(
        "/api/v1/lessons", headers=auth(token), json=payload(student, start)
    )

    assert response.status_code == 201


async def test_confirm_conflict_does_not_bypass_validation_or_access(
    api_context: ApiTestContext,
) -> None:
    _, token, student, student_token = await participants(api_context)
    start = utc_now() + timedelta(days=30)
    invalid_student = await api_context.client.post(
        "/api/v1/lessons",
        headers=auth(token),
        json={**payload(student, start), "student_id": str(uuid4()), "confirm_conflict": True},
    )
    past = await api_context.client.post(
        "/api/v1/lessons",
        headers=auth(token),
        json={**payload(student, utc_now() - timedelta(days=1)), "confirm_conflict": True},
    )
    forbidden = await api_context.client.post(
        "/api/v1/lessons",
        headers=auth(student_token),
        json={**payload(student, start), "confirm_conflict": True},
    )
    extra = await api_context.client.post(
        "/api/v1/lessons",
        headers=auth(token),
        json={**payload(student, start), "teacher_id": str(uuid4())},
    )

    assert invalid_student.status_code == 404
    assert past.status_code == 400
    assert forbidden.status_code == 403
    assert extra.status_code == 422


async def test_reschedule_updates_only_schedule_and_is_visible_to_student(
    api_context: ApiTestContext,
) -> None:
    teacher, token, student, student_token = await participants(api_context)
    start = utc_now() + timedelta(days=30)
    lesson = await store_lesson(api_context, teacher, student, start)
    new_start = start + timedelta(days=8, hours=2)

    response = await api_context.client.patch(
        f"/api/v1/lessons/{lesson.id}/schedule",
        headers=auth(token),
        json={"starts_at": new_start.isoformat()},
    )
    student_get = await api_context.client.get(
        f"/api/v1/lessons/{lesson.id}", headers=auth(student_token)
    )
    await api_context.session.refresh(lesson)

    assert response.status_code == 200
    assert response.json()["id"] == str(lesson.id)
    assert response.json()["is_rescheduled"] is True
    assert response.json()["status"] == "planned"
    assert response.json()["cancellation_reason"] is None
    assert datetime.fromisoformat(response.json()["starts_at"]) == new_start
    assert student_get.status_code == 200
    assert datetime.fromisoformat(student_get.json()["starts_at"]) == new_start
    assert lesson.rescheduled_at is not None
    assert lesson.teacher_id == teacher.id
    assert lesson.student_id == student.id
    assert lesson.title == "История"
    assert lesson.description == "Тема"
    assert lesson.duration_minutes == 60
    assert lesson.attendance is None


async def test_reschedule_self_conflict_and_same_time(api_context: ApiTestContext) -> None:
    teacher, token, student, _ = await participants(api_context)
    start = utc_now() + timedelta(days=30)
    lesson = await store_lesson(api_context, teacher, student, start)
    path = f"/api/v1/lessons/{lesson.id}/schedule"
    same = await api_context.client.patch(
        path,
        headers=auth(token),
        json={"starts_at": start.isoformat()},
    )
    moved = await api_context.client.patch(
        path,
        headers=auth(token),
        json={"starts_at": (start + timedelta(minutes=15)).isoformat()},
    )

    assert same.status_code == 409
    assert same.json()["error"]["code"] == "lesson_schedule_unchanged"
    assert moved.status_code == 200


async def test_reschedule_conflict_requires_confirmation(api_context: ApiTestContext) -> None:
    teacher, token, student, _ = await participants(api_context)
    start = utc_now() + timedelta(days=30)
    lesson = await store_lesson(api_context, teacher, student, start)
    blocker = await store_lesson(api_context, teacher, student, start + timedelta(hours=2))
    blocker_id = blocker.id
    proposed = {"starts_at": blocker.starts_at.isoformat()}
    path = f"/api/v1/lessons/{lesson.id}/schedule"

    warning = await api_context.client.patch(path, headers=auth(token), json=proposed)
    await api_context.session.refresh(lesson)
    assert warning.status_code == 409
    assert warning.json()["error"]["context"]["conflicts"][0]["id"] == str(blocker_id)
    assert lesson.starts_at == start
    assert lesson.rescheduled_at is None

    confirmed = await api_context.client.patch(
        path, headers=auth(token), json={**proposed, "confirm_conflict": True}
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["is_rescheduled"] is True


@pytest.mark.parametrize("offset", [timedelta(), timedelta(minutes=-90)])
async def test_reschedule_rejects_started_or_completed(
    api_context: ApiTestContext,
    offset: timedelta,
) -> None:
    teacher, token, student, _ = await participants(api_context)
    lesson = await store_lesson(api_context, teacher, student, utc_now() + offset)
    original = lesson.starts_at
    response = await api_context.client.patch(
        f"/api/v1/lessons/{lesson.id}/schedule",
        headers=auth(token),
        json={"starts_at": (utc_now() + timedelta(days=2)).isoformat()},
    )
    await api_context.session.refresh(lesson)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "lesson_not_reschedulable"
    assert lesson.starts_at == original


async def test_reschedule_rejects_past_naive_foreign_and_cancelled(
    api_context: ApiTestContext,
) -> None:
    teacher, token, student, student_token = await participants(api_context)
    _, other_token = await actor(api_context, RoleCode.TEACHER)
    lesson = await store_lesson(api_context, teacher, student, utc_now() + timedelta(days=30))
    path = f"/api/v1/lessons/{lesson.id}/schedule"
    past = await api_context.client.patch(
        path, headers=auth(token), json={"starts_at": (utc_now() - timedelta(days=1)).isoformat()}
    )
    naive = await api_context.client.patch(
        path, headers=auth(token), json={"starts_at": "2030-01-01T12:00:00"}
    )
    foreign = await api_context.client.patch(
        path,
        headers=auth(other_token),
        json={"starts_at": (utc_now() + timedelta(days=31)).isoformat()},
    )
    missing = await api_context.client.patch(
        f"/api/v1/lessons/{uuid4()}/schedule",
        headers=auth(token),
        json={"starts_at": (utc_now() + timedelta(days=31)).isoformat()},
    )
    student_response = await api_context.client.patch(
        path,
        headers=auth(student_token),
        json={"starts_at": (utc_now() + timedelta(days=31)).isoformat()},
    )
    cancelled = await api_context.client.post(
        path.removesuffix("/schedule") + "/cancel", headers=auth(token)
    )
    after_cancel = await api_context.client.patch(
        path, headers=auth(token), json={"starts_at": (utc_now() + timedelta(days=31)).isoformat()}
    )

    assert past.status_code == 400
    assert naive.status_code == 422
    assert foreign.status_code == missing.status_code == 404
    assert student_response.status_code == 403
    assert cancelled.status_code == 200
    assert after_cancel.status_code == 409
    assert after_cancel.json()["error"]["code"] == "lesson_not_reschedulable"


async def test_cancel_is_persistent_idempotent_and_frees_slot(
    api_context: ApiTestContext,
) -> None:
    teacher, token, student, student_token = await participants(api_context)
    start = utc_now() + timedelta(days=30)
    lesson = await store_lesson(api_context, teacher, student, start)
    path = f"/api/v1/lessons/{lesson.id}/cancel"
    first = await api_context.client.post(
        path, headers=auth(token), json={"reason": "  Перенос не состоялся  "}
    )
    await api_context.session.refresh(lesson)
    cancelled_at = lesson.cancelled_at
    second = await api_context.client.post(
        path, headers=auth(token), json={"reason": "Другая причина"}
    )
    await api_context.session.refresh(lesson)
    student_get = await api_context.client.get(
        f"/api/v1/lessons/{lesson.id}", headers=auth(student_token)
    )
    student_search = await api_context.client.post(
        "/api/v1/lessons/search", headers=auth(student_token), json={}
    )
    replacement = await api_context.client.post(
        "/api/v1/lessons", headers=auth(token), json=payload(student, start)
    )

    assert first.status_code == second.status_code == 200
    assert first.json()["status"] == second.json()["status"] == "cancelled"
    assert first.json()["cancellation_reason"] == "Перенос не состоялся"
    assert second.json()["cancellation_reason"] == "Перенос не состоялся"
    assert cancelled_at is not None
    assert lesson.cancelled_at == cancelled_at
    assert lesson.cancellation_reason == "Перенос не состоялся"
    assert student_get.json()["status"] == "cancelled"
    assert student_get.json()["cancellation_reason"] == "Перенос не состоялся"
    assert student_search.json()[0]["status"] == "cancelled"
    assert student_search.json()[0]["cancellation_reason"] == "Перенос не состоялся"
    assert replacement.status_code == 201


@pytest.mark.parametrize(
    ("body", "expected_reason"),
    [
        ({"reason": "  Ученик не смог прийти  "}, "Ученик не смог прийти"),
        (None, None),
        ({}, None),
    ],
)
async def test_cancel_planned_with_optional_reason(
    api_context: ApiTestContext,
    body: dict[str, str] | None,
    expected_reason: str | None,
) -> None:
    teacher, token, student, _ = await participants(api_context)
    lesson = await store_lesson(api_context, teacher, student, utc_now() + timedelta(days=30))
    path = f"/api/v1/lessons/{lesson.id}/cancel"
    if body is None:
        response = await api_context.client.post(path, headers=auth(token))
    else:
        response = await api_context.client.post(path, headers=auth(token), json=body)
    await api_context.session.refresh(lesson)

    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    assert response.json()["cancellation_reason"] == expected_reason
    assert lesson.cancelled_at is not None
    assert lesson.cancellation_reason == expected_reason
    assert lesson.attendance is None
    assert lesson.attendance_updated_at is None


@pytest.mark.parametrize(
    ("raw_reason", "expected_reason"),
    [
        ("", None),
        ("   ", None),
        ("  причина  ", "причина"),
        ("x" * 500, "x" * 500),
        (None, None),
    ],
)
async def test_cancel_reason_normalization(
    api_context: ApiTestContext,
    raw_reason: str | None,
    expected_reason: str | None,
) -> None:
    teacher, token, student, _ = await participants(api_context)
    lesson = await store_lesson(api_context, teacher, student, utc_now() + timedelta(days=2))
    response = await api_context.client.post(
        f"/api/v1/lessons/{lesson.id}/cancel",
        headers=auth(token),
        json={"reason": raw_reason},
    )
    await api_context.session.refresh(lesson)

    assert response.status_code == 200
    assert response.json()["cancellation_reason"] == expected_reason
    assert lesson.cancellation_reason == expected_reason


@pytest.mark.parametrize(
    "body",
    [
        {"reason": "x" * 501},
        {"reason": 123},
        {"reason": "Причина", "teacher_id": str(uuid4())},
        {"reason": "Причина", "student_id": str(uuid4())},
        {"unknown": True},
    ],
)
async def test_cancel_rejects_invalid_reason_or_extra_fields(
    api_context: ApiTestContext,
    body: dict[str, object],
) -> None:
    teacher, token, student, _ = await participants(api_context)
    lesson = await store_lesson(api_context, teacher, student, utc_now() + timedelta(days=2))
    response = await api_context.client.post(
        f"/api/v1/lessons/{lesson.id}/cancel", headers=auth(token), json=body
    )
    await api_context.session.refresh(lesson)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert lesson.cancelled_at is None
    assert lesson.cancellation_reason is None


@pytest.mark.parametrize(
    ("body", "expected_reason"),
    [({"reason": "  Student is unavailable  "}, "Student is unavailable"), (None, None)],
)
async def test_cancel_in_progress_preserves_attendance_and_is_idempotent(
    api_context: ApiTestContext,
    body: dict[str, str] | None,
    expected_reason: str | None,
) -> None:
    teacher, token, student, student_token = await participants(api_context)
    lesson = await store_lesson(
        api_context, teacher, student, utc_now() - timedelta(minutes=30)
    )
    path = f"/api/v1/lessons/{lesson.id}"
    attendance = await api_context.client.put(
        f"{path}/attendance", headers=auth(token), json={"attendance": "present"}
    )
    await api_context.session.refresh(lesson)
    attendance_updated_at = lesson.attendance_updated_at
    if body is None:
        response = await api_context.client.post(f"{path}/cancel", headers=auth(token))
    else:
        response = await api_context.client.post(f"{path}/cancel", headers=auth(token), json=body)
    await api_context.session.refresh(lesson)
    cancelled_at = lesson.cancelled_at
    repeated = await api_context.client.post(
        f"{path}/cancel", headers=auth(token), json={"reason": "Different reason"}
    )
    blocked_attendance = await api_context.client.put(
        f"{path}/attendance", headers=auth(token), json={"attendance": "absent"}
    )
    student_get = await api_context.client.get(path, headers=auth(student_token))
    student_search = await api_context.client.post(
        "/api/v1/lessons/search", headers=auth(student_token), json={}
    )
    await api_context.session.refresh(lesson)

    assert attendance.status_code == 200
    assert response.status_code == repeated.status_code == 200
    assert response.json()["status"] == repeated.json()["status"] == "cancelled"
    assert response.json()["cancellation_reason"] == expected_reason
    assert repeated.json()["cancellation_reason"] == expected_reason
    assert response.json()["attendance"] == repeated.json()["attendance"] == "present"
    assert cancelled_at is not None
    assert lesson.cancelled_at == cancelled_at
    assert lesson.cancellation_reason == expected_reason
    assert lesson.attendance == AttendanceValue.PRESENT
    assert attendance_updated_at is not None
    assert lesson.attendance_updated_at == attendance_updated_at
    assert blocked_attendance.status_code == 409
    assert blocked_attendance.json()["error"]["code"] == "attendance_not_available"
    assert student_get.json()["status"] == "cancelled"
    assert student_get.json()["cancellation_reason"] == expected_reason
    searched = next(item for item in student_search.json() if item["id"] == str(lesson.id))
    assert searched["status"] == "cancelled"
    assert searched["cancellation_reason"] == expected_reason


async def test_cancel_rejects_completed(
    api_context: ApiTestContext,
) -> None:
    teacher, token, student, _ = await participants(api_context)
    lesson = await store_lesson(api_context, teacher, student, utc_now() - timedelta(minutes=90))
    response = await api_context.client.post(
        f"/api/v1/lessons/{lesson.id}/cancel", headers=auth(token)
    )
    await api_context.session.refresh(lesson)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "lesson_not_cancellable"
    assert lesson.cancelled_at is None


async def test_cancel_private_not_found_and_authentication(api_context: ApiTestContext) -> None:
    teacher, token, student, student_token = await participants(api_context)
    _, other_token = await actor(api_context, RoleCode.TEACHER)
    lesson = await store_lesson(api_context, teacher, student, utc_now() + timedelta(days=30))
    path = f"/api/v1/lessons/{lesson.id}/cancel"

    foreign = await api_context.client.post(path, headers=auth(other_token))
    missing = await api_context.client.post(
        f"/api/v1/lessons/{uuid4()}/cancel", headers=auth(token)
    )
    student_response = await api_context.client.post(path, headers=auth(student_token))
    anonymous = await api_context.client.post(path)

    assert foreign.status_code == missing.status_code == 404
    assert foreign.json()["error"]["code"] == missing.json()["error"]["code"]
    assert student_response.status_code == 403
    assert anonymous.status_code == 401


@pytest.mark.parametrize("at_end", [False, True])
async def test_exact_start_and_end_cancel_boundaries(
    api_context: ApiTestContext,
    monkeypatch: pytest.MonkeyPatch,
    at_end: bool,
) -> None:
    teacher, token, student, _ = await participants(api_context)
    start = utc_now() + timedelta(days=30)
    lesson = await store_lesson(api_context, teacher, student, start)
    path = f"/api/v1/lessons/{lesson.id}"
    boundary = start + timedelta(hours=1) if at_end else start
    monkeypatch.setattr("app.services.lessons.utc_now", lambda: boundary)
    reschedule = await api_context.client.patch(
        f"{path}/schedule",
        headers=auth(token),
        json={"starts_at": (start + timedelta(days=1)).isoformat()},
    )
    cancel = await api_context.client.post(f"{path}/cancel", headers=auth(token))

    assert reschedule.status_code == 409
    assert reschedule.json()["error"]["code"] == "lesson_not_reschedulable"
    if at_end:
        assert cancel.status_code == 409
        assert cancel.json()["error"]["code"] == "lesson_not_cancellable"
    else:
        assert cancel.status_code == 200
        assert cancel.json()["status"] == "cancelled"


@pytest.mark.parametrize("action", ["reschedule", "cancel"])
async def test_schedule_write_rolls_back_on_commit_error(
    api_context: ApiTestContext,
    monkeypatch: pytest.MonkeyPatch,
    action: str,
) -> None:
    teacher, token, student, _ = await participants(api_context)
    start = utc_now() + timedelta(days=30)
    lesson = await store_lesson(api_context, teacher, student, start)
    original = lesson.starts_at

    async def broken_commit() -> None:
        raise RuntimeError("Simulated commit failure")

    monkeypatch.setattr(api_context.session, "commit", broken_commit)
    with pytest.raises(RuntimeError, match="Simulated commit failure"):
        if action == "reschedule":
            await api_context.client.patch(
                f"/api/v1/lessons/{lesson.id}/schedule",
                headers=auth(token),
                json={"starts_at": (start + timedelta(days=1)).isoformat()},
            )
        else:
            await api_context.client.post(
                f"/api/v1/lessons/{lesson.id}/cancel",
                headers=auth(token),
                json={"reason": "Отмена при ошибке"},
            )

    await api_context.session.refresh(lesson)
    assert lesson.starts_at == original
    assert lesson.rescheduled_at is None
    assert lesson.cancelled_at is None
    assert lesson.cancellation_reason is None
