from datetime import UTC, datetime, timedelta
from typing import Protocol, cast
from uuid import UUID, uuid4

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import PasswordService
from app.models.enums import AttendanceValue, RoleCode
from app.models.lesson import Lesson
from app.models.profile import Profile
from app.models.role_profiles import StudentProfile, TeacherProfile
from app.models.user import User

pytestmark = [pytest.mark.asyncio, pytest.mark.postgresql]

PASSWORD = "StrongPass!123"
PASSWORD_HASH = PasswordService().hash(PASSWORD)


class ApiTestContext(Protocol):
    client: httpx.AsyncClient
    session: AsyncSession


def authorization(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def create_actor(
    context: ApiTestContext,
    role: RoleCode,
    name: str,
    *,
    middle_name: str | None = None,
) -> tuple[User, str]:
    email = f"{name.lower()}-{uuid4().hex}@example.com"
    user = User(
        email=email,
        password_hash=PASSWORD_HASH,
        role=role,
        is_active=True,
    )
    user.profile = Profile(
        first_name=name,
        last_name="Example",
        middle_name=middle_name,
        timezone="Europe/Moscow",
    )
    if role == RoleCode.TEACHER:
        user.teacher_profile = TeacherProfile()
    elif role == RoleCode.STUDENT:
        user.student_profile = StudentProfile()
    context.session.add(user)
    await context.session.commit()
    login = await context.client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
    )
    assert login.status_code == 200
    return user, cast(str, login.json()["access_token"])


async def store_lesson(
    context: ApiTestContext,
    teacher: User,
    student: User,
    starts_at: datetime,
    *,
    title: str = "Математика",
    description: str | None = None,
) -> Lesson:
    lesson = Lesson(
        teacher_id=teacher.id,
        student_id=student.id,
        title=title,
        description=description,
        starts_at=starts_at,
        duration_minutes=60,
    )
    context.session.add(lesson)
    await context.session.commit()
    return lesson


async def search(
    context: ApiTestContext,
    token: str,
    payload: dict[str, object],
) -> httpx.Response:
    return await context.client.post(
        "/api/v1/lessons/search",
        headers=authorization(token),
        json=payload,
    )


async def test_student_search_scope_boundaries_sorting_and_dto(
    api_context: ApiTestContext,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    teacher, _ = await create_actor(api_context, RoleCode.TEACHER, "Teacher", middle_name="T")
    student, student_token = await create_actor(
        api_context, RoleCode.STUDENT, "Student", middle_name="S"
    )
    other_student, _ = await create_actor(api_context, RoleCode.STUDENT, "Other")
    boundary = datetime(2026, 10, 20, 15, tzinfo=UTC)
    before = await store_lesson(
        api_context, teacher, student, boundary - timedelta(microseconds=1), title="Before"
    )
    exact = await store_lesson(
        api_context, teacher, student, boundary, title="Exact", description="Details"
    )
    after = await store_lesson(
        api_context, teacher, student, boundary + timedelta(hours=1), title="After"
    )
    await store_lesson(api_context, teacher, other_student, boundary, title="Foreign")
    monkeypatch.setattr(
        "app.api.routes.lessons.utc_now",
        lambda: boundary - timedelta(hours=1),
    )

    all_lessons = await search(api_context, student_token, {})
    interval = await search(
        api_context,
        student_token,
        {
            "date_from": "2026-10-20T18:00:00+03:00",
            "date_to": "2026-10-20T16:00:00Z",
        },
    )
    upper_bound = await search(
        api_context, student_token, {"date_to": "2026-10-20T15:00:00Z"}
    )

    assert all_lessons.status_code == 200
    assert [item["id"] for item in all_lessons.json()] == [
        str(before.id),
        str(exact.id),
        str(after.id),
    ]
    assert [item["id"] for item in interval.json()] == [str(exact.id)]
    assert [item["id"] for item in upper_bound.json()] == [str(before.id)]
    assert interval.json()[0] == {
        "id": str(exact.id),
        "title": "Exact",
        "description": "Details",
        "starts_at": interval.json()[0]["starts_at"],
        "ends_at": interval.json()[0]["ends_at"],
        "duration_minutes": 60,
        "status": "planned",
        "is_rescheduled": False,
        "attendance": "not_set",
        "teacher": {
            "id": str(teacher.id),
            "first_name": "Teacher",
            "last_name": "Example",
            "middle_name": "T",
        },
        "student": {
            "id": str(student.id),
            "first_name": "Student",
            "last_name": "Example",
            "middle_name": "S",
        },
    }
    assert datetime.fromisoformat(interval.json()[0]["ends_at"]) == boundary + timedelta(
        minutes=60
    )


async def test_student_upcoming_search_uses_explicit_date_from(
    api_context: ApiTestContext,
) -> None:
    teacher, _ = await create_actor(api_context, RoleCode.TEACHER, "Teacher")
    student, token = await create_actor(api_context, RoleCode.STUDENT, "Student")
    now = datetime(2026, 10, 20, 15, tzinfo=UTC)
    past = await store_lesson(api_context, teacher, student, now - timedelta(seconds=1))
    exact = await store_lesson(api_context, teacher, student, now)
    future = await store_lesson(api_context, teacher, student, now + timedelta(seconds=1))

    unfiltered = await search(api_context, token, {})
    upcoming = await search(api_context, token, {"date_from": "2026-10-20T18:00:00+03:00"})

    assert [item["id"] for item in unfiltered.json()] == [
        str(past.id),
        str(exact.id),
        str(future.id),
    ]
    assert [item["id"] for item in upcoming.json()] == [str(exact.id), str(future.id)]


async def test_teacher_search_is_owned_and_allows_past_range(
    api_context: ApiTestContext,
) -> None:
    teacher, token = await create_actor(api_context, RoleCode.TEACHER, "Owner")
    other_teacher, _ = await create_actor(api_context, RoleCode.TEACHER, "Other")
    student, _ = await create_actor(api_context, RoleCode.STUDENT, "Student")
    start = datetime(2020, 1, 1, tzinfo=UTC)
    first = await store_lesson(api_context, teacher, student, start)
    second = await store_lesson(api_context, teacher, student, start + timedelta(days=1))
    await store_lesson(api_context, other_teacher, student, start, title="Foreign")

    all_lessons = await search(api_context, token, {})
    past_range = await search(
        api_context,
        token,
        {
            "date_from": start.isoformat(),
            "date_to": (start + timedelta(days=1)).isoformat(),
        },
    )
    empty = await search(
        api_context,
        token,
        {"date_from": (start + timedelta(days=2)).isoformat()},
    )

    assert [item["id"] for item in all_lessons.json()] == [str(first.id), str(second.id)]
    assert [item["id"] for item in past_range.json()] == [str(first.id)]
    assert empty.status_code == 200
    assert empty.json() == []


async def test_admin_search_has_global_scope_and_filters(
    api_context: ApiTestContext,
) -> None:
    admin, admin_token = await create_actor(api_context, RoleCode.ADMIN, "Admin")
    first_teacher, _ = await create_actor(api_context, RoleCode.TEACHER, "FirstTeacher")
    second_teacher, _ = await create_actor(api_context, RoleCode.TEACHER, "SecondTeacher")
    first_student, _ = await create_actor(api_context, RoleCode.STUDENT, "FirstStudent")
    second_student, _ = await create_actor(api_context, RoleCode.STUDENT, "SecondStudent")
    assert admin.role == RoleCode.ADMIN
    start = datetime(2026, 1, 1, tzinfo=UTC)
    first = await store_lesson(api_context, first_teacher, first_student, start)
    second = await store_lesson(
        api_context, second_teacher, second_student, start + timedelta(days=1)
    )

    global_result = await search(api_context, admin_token, {})
    lower = await search(
        api_context, admin_token, {"date_from": (start + timedelta(days=1)).isoformat()}
    )
    upper = await search(
        api_context, admin_token, {"date_to": (start + timedelta(days=1)).isoformat()}
    )
    interval = await search(
        api_context,
        admin_token,
        {
            "date_from": (start + timedelta(hours=12)).isoformat(),
            "date_to": (start + timedelta(days=2)).isoformat(),
        },
    )
    empty = await search(
        api_context, admin_token, {"date_from": (start + timedelta(days=2)).isoformat()}
    )

    assert [item["id"] for item in global_result.json()] == [str(first.id), str(second.id)]
    assert [item["id"] for item in lower.json()] == [str(second.id)]
    assert [item["id"] for item in upper.json()] == [str(first.id)]
    assert [item["id"] for item in interval.json()] == [str(second.id)]
    assert empty.json() == []


@pytest.mark.parametrize(
    "payload",
    [
        {"date_from": "2026-10-20T18:00:00"},
        {"date_to": "2026-10-20T18:00:00"},
        {"date_from": "not-a-date"},
        {
            "date_from": "2026-10-20T15:00:00Z",
            "date_to": "2026-10-20T15:00:00Z",
        },
        {
            "date_from": "2026-10-21T15:00:00Z",
            "date_to": "2026-10-20T15:00:00Z",
        },
        {"student_id": str(uuid4())},
    ],
)
async def test_search_validation(
    api_context: ApiTestContext,
    payload: dict[str, object],
) -> None:
    _, token = await create_actor(api_context, RoleCode.STUDENT, "Student")
    response = await search(api_context, token, payload)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


async def test_search_accepts_nulls_and_requires_authentication(
    api_context: ApiTestContext,
) -> None:
    _, token = await create_actor(api_context, RoleCode.STUDENT, "Student")
    nullable = await search(api_context, token, {"date_from": None, "date_to": None})
    unauthenticated = await api_context.client.post("/api/v1/lessons/search", json={})
    assert nullable.status_code == 200
    assert nullable.json() == []
    assert unauthenticated.status_code == 401
    assert unauthenticated.json()["error"]["code"] == "authentication_required"


async def test_get_lesson_by_id_enforces_private_ownership(
    api_context: ApiTestContext,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner_teacher, owner_teacher_token = await create_actor(
        api_context, RoleCode.TEACHER, "OwnerTeacher"
    )
    other_teacher, other_teacher_token = await create_actor(
        api_context, RoleCode.TEACHER, "OtherTeacher"
    )
    owner_student, owner_student_token = await create_actor(
        api_context, RoleCode.STUDENT, "OwnerStudent"
    )
    other_student, other_student_token = await create_actor(
        api_context, RoleCode.STUDENT, "OtherStudent"
    )
    _, admin_token = await create_actor(api_context, RoleCode.ADMIN, "Admin")
    lesson = await store_lesson(
        api_context,
        owner_teacher,
        owner_student,
        datetime(2026, 10, 20, 15, tzinfo=UTC),
        description="Details",
    )
    monkeypatch.setattr(
        "app.api.routes.lessons.utc_now",
        lambda: lesson.starts_at + timedelta(minutes=30),
    )

    async def get(token: str, lesson_id: UUID) -> httpx.Response:
        return await api_context.client.get(
            f"/api/v1/lessons/{lesson_id}", headers=authorization(token)
        )

    teacher_owned = await get(owner_teacher_token, lesson.id)
    student_owned = await get(owner_student_token, lesson.id)
    admin_global = await get(admin_token, lesson.id)
    teacher_foreign = await get(other_teacher_token, lesson.id)
    student_foreign = await get(other_student_token, lesson.id)

    assert teacher_owned.status_code == student_owned.status_code == admin_global.status_code == 200
    assert teacher_owned.json() == student_owned.json() == admin_global.json()
    assert teacher_owned.json()["teacher"]["id"] == str(owner_teacher.id)
    assert teacher_owned.json()["student"]["id"] == str(owner_student.id)
    assert teacher_owned.json()["status"] == "in_progress"
    assert teacher_owned.json()["attendance"] == "not_set"
    assert teacher_owned.json()["is_rescheduled"] is False
    assert datetime.fromisoformat(teacher_owned.json()["ends_at"]) == (
        lesson.starts_at + timedelta(minutes=60)
    )
    for response in (teacher_foreign, student_foreign):
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "lesson_not_found"


async def test_read_dto_includes_persisted_lesson_facts(api_context: ApiTestContext) -> None:
    teacher, teacher_token = await create_actor(api_context, RoleCode.TEACHER, "Teacher")
    student, student_token = await create_actor(api_context, RoleCode.STUDENT, "Student")
    start = datetime(2030, 1, 1, 12, tzinfo=UTC)
    lesson = await store_lesson(api_context, teacher, student, start)
    lesson.rescheduled_at = start - timedelta(days=1)
    lesson.cancelled_at = start - timedelta(hours=1)
    lesson.attendance = AttendanceValue.PRESENT
    lesson.attendance_updated_at = start - timedelta(hours=2)
    await api_context.session.commit()

    get_response = await api_context.client.get(
        f"/api/v1/lessons/{lesson.id}", headers=authorization(student_token)
    )
    search_response = await search(api_context, teacher_token, {})

    assert get_response.status_code == search_response.status_code == 200
    for item in (get_response.json(), search_response.json()[0]):
        assert item["status"] == "cancelled"
        assert item["is_rescheduled"] is True
        assert item["attendance"] == "present"
        assert datetime.fromisoformat(item["ends_at"]) == start + timedelta(hours=1)


async def test_search_uses_one_now_for_all_statuses(
    api_context: ApiTestContext,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    teacher, token = await create_actor(api_context, RoleCode.TEACHER, "Teacher")
    student, _ = await create_actor(api_context, RoleCode.STUDENT, "Student")
    start = datetime(2030, 1, 1, 12, tzinfo=UTC)
    await store_lesson(api_context, teacher, student, start, title="First")
    await store_lesson(api_context, teacher, student, start, title="Second")
    calls = 0

    def changing_now() -> datetime:
        nonlocal calls
        calls += 1
        return start - timedelta(microseconds=1) if calls == 1 else start

    monkeypatch.setattr("app.api.routes.lessons.utc_now", changing_now)

    response = await search(api_context, token, {})

    assert response.status_code == 200
    assert calls == 1
    assert [item["status"] for item in response.json()] == ["planned", "planned"]


async def test_get_lesson_by_id_not_found_validation_and_authentication(
    api_context: ApiTestContext,
) -> None:
    _, student_token = await create_actor(api_context, RoleCode.STUDENT, "Student")
    _, admin_token = await create_actor(api_context, RoleCode.ADMIN, "Admin")
    missing_id = uuid4()
    student_missing = await api_context.client.get(
        f"/api/v1/lessons/{missing_id}", headers=authorization(student_token)
    )
    admin_missing = await api_context.client.get(
        f"/api/v1/lessons/{missing_id}", headers=authorization(admin_token)
    )
    malformed = await api_context.client.get(
        "/api/v1/lessons/not-a-uuid", headers=authorization(student_token)
    )
    unauthenticated = await api_context.client.get(f"/api/v1/lessons/{missing_id}")

    assert student_missing.status_code == admin_missing.status_code == 404
    assert student_missing.json()["error"]["code"] == "lesson_not_found"
    assert admin_missing.json()["error"]["code"] == "lesson_not_found"
    assert malformed.status_code == 422
    assert malformed.json()["error"]["code"] == "validation_error"
    assert unauthenticated.status_code == 401
