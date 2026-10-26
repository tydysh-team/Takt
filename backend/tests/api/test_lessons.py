from datetime import UTC, datetime, timedelta
from typing import Protocol, cast
from uuid import UUID, uuid4

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import PasswordService, utc_now
from app.models.enums import RelationStatus, RoleCode
from app.models.lesson import Lesson
from app.models.profile import Profile
from app.models.teacher_student_relation import TeacherStudentRelation
from app.models.user import User

pytestmark = [pytest.mark.asyncio, pytest.mark.postgresql]

PASSWORD = "StrongPass!123"


class ApiTestContext(Protocol):
    client: httpx.AsyncClient
    session: AsyncSession


def authorization(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def register_and_login(
    context: ApiTestContext,
    role: str,
    *,
    middle_name: str | None = None,
) -> tuple[dict[str, str], str]:
    email = f"{role.lower()}-{uuid4().hex}@example.com"
    registration = await context.client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": PASSWORD,
            "first_name": role.title(),
            "last_name": "Example",
            "middle_name": middle_name,
            "role": role,
        },
    )
    assert registration.status_code == 201
    login = await context.client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
    )
    assert login.status_code == 200
    return cast(dict[str, str], registration.json()), cast(str, login.json()["access_token"])


async def connect(
    context: ApiTestContext,
    teacher_token: str,
    student_token: str,
) -> None:
    invitation = await context.client.post(
        "/api/v1/invitations",
        headers=authorization(teacher_token),
    )
    assert invitation.status_code == 201
    accepted = await context.client.post(
        "/api/v1/connections/accept",
        headers=authorization(student_token),
        json={"code": invitation.json()["code"]},
    )
    assert accepted.status_code == 200


def lesson_payload(student_id: str, **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "student_id": student_id,
        "title": "Математика",
        "description": "Квадратные уравнения",
        "starts_at": (utc_now() + timedelta(days=1)).isoformat(),
        "duration_minutes": 60,
    }
    payload.update(overrides)
    return payload


async def lesson_count(context: ApiTestContext) -> int:
    return int(await context.session.scalar(select(func.count()).select_from(Lesson)) or 0)


async def test_teacher_student_refs_reuse_active_connection_list(
    api_context: ApiTestContext,
) -> None:
    _, teacher_token = await register_and_login(api_context, "TEACHER")
    student, student_token = await register_and_login(
        api_context, "STUDENT", middle_name="Иванович"
    )
    other, other_token = await register_and_login(api_context, "STUDENT")
    await connect(api_context, teacher_token, student_token)
    await connect(api_context, teacher_token, other_token)
    relation = await api_context.session.scalar(
        select(TeacherStudentRelation).where(TeacherStudentRelation.student_id == UUID(other["id"]))
    )
    assert relation is not None
    relation.status = RelationStatus.INACTIVE
    relation.deactivated_at = utc_now()
    await api_context.session.commit()

    response = await api_context.client.get(
        "/api/v1/teachers/me/students", headers=authorization(teacher_token)
    )
    management = await api_context.client.get(
        "/api/v1/students", headers=authorization(teacher_token)
    )

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": student["id"],
            "first_name": "Student",
            "last_name": "Example",
            "middle_name": "Иванович",
        }
    ]
    assert management.status_code == 200
    assert [item["id"] for item in management.json()] == [student["id"]]


async def test_student_refs_empty_authentication_and_authorization(
    api_context: ApiTestContext,
) -> None:
    _, teacher_token = await register_and_login(api_context, "TEACHER")
    _, student_token = await register_and_login(api_context, "STUDENT")

    empty = await api_context.client.get(
        "/api/v1/teachers/me/students", headers=authorization(teacher_token)
    )
    forbidden = await api_context.client.get(
        "/api/v1/teachers/me/students", headers=authorization(student_token)
    )
    unauthenticated = await api_context.client.get("/api/v1/teachers/me/students")

    assert empty.status_code == 200
    assert empty.json() == []
    assert forbidden.status_code == 403
    assert forbidden.json()["error"]["code"] == "forbidden"
    assert unauthenticated.status_code == 401
    assert unauthenticated.json()["error"]["code"] == "authentication_required"


async def test_duplicate_time_requires_confirmation(
    api_context: ApiTestContext,
) -> None:
    teacher, teacher_token = await register_and_login(api_context, "TEACHER")
    student, student_token = await register_and_login(api_context, "STUDENT")
    await connect(api_context, teacher_token, student_token)
    payload = lesson_payload(student["id"], title="  Математика  ")

    first = await api_context.client.post(
        "/api/v1/lessons", headers=authorization(teacher_token), json=payload
    )
    conflict = await api_context.client.post(
        "/api/v1/lessons", headers=authorization(teacher_token), json=payload
    )
    confirmed = await api_context.client.post(
        "/api/v1/lessons",
        headers=authorization(teacher_token),
        json={**payload, "confirm_conflict": True},
    )

    assert first.status_code == 201
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "lesson_time_conflict"
    assert len(conflict.json()["error"]["context"]["conflicts"]) == 1
    assert confirmed.status_code == 201
    assert await lesson_count(api_context) == 2
    assert first.json() == {
        "id": first.json()["id"],
        "teacher_id": teacher["id"],
        "student_id": student["id"],
        "title": "Математика",
        "description": "Квадратные уравнения",
        "starts_at": first.json()["starts_at"],
        "ends_at": first.json()["ends_at"],
        "duration_minutes": 60,
        "status": "planned",
        "is_rescheduled": False,
        "attendance": "not_set",
        "cancellation_reason": None,
    }
    assert datetime.fromisoformat(first.json()["starts_at"]) == datetime.fromisoformat(
        cast(str, payload["starts_at"])
    )
    assert datetime.fromisoformat(first.json()["ends_at"]) == datetime.fromisoformat(
        first.json()["starts_at"]
    ) + timedelta(minutes=60)


@pytest.mark.parametrize("duration", [1, 15, 75, 95, 137, 2147483647])
async def test_any_positive_sql_integer_duration_is_accepted(
    api_context: ApiTestContext, duration: int
) -> None:
    _, teacher_token = await register_and_login(api_context, "TEACHER")
    student, student_token = await register_and_login(api_context, "STUDENT")
    await connect(api_context, teacher_token, student_token)
    response = await api_context.client.post(
        "/api/v1/lessons",
        headers=authorization(teacher_token),
        json=lesson_payload(student["id"], duration_minutes=duration),
    )
    assert response.status_code == 201
    assert response.json()["duration_minutes"] == duration
    lesson = await api_context.session.get(Lesson, UUID(response.json()["id"]))
    assert lesson is not None and lesson.duration_minutes == duration


@pytest.mark.parametrize("description", [None, "omitted"])
async def test_description_is_nullable_or_omitted(
    api_context: ApiTestContext,
    description: str | None,
) -> None:
    _, teacher_token = await register_and_login(api_context, "TEACHER")
    student, student_token = await register_and_login(api_context, "STUDENT")
    await connect(api_context, teacher_token, student_token)
    payload = lesson_payload(student["id"])
    if description == "omitted":
        payload.pop("description")
    else:
        payload["description"] = description

    response = await api_context.client.post(
        "/api/v1/lessons", headers=authorization(teacher_token), json=payload
    )

    assert response.status_code == 201
    assert response.json()["description"] is None


@pytest.mark.parametrize(
    ("changes", "expected_status", "expected_code"),
    [
        ({"title": ""}, 422, "validation_error"),
        ({"title": "   "}, 422, "validation_error"),
        ({"title": "x" * 121}, 422, "validation_error"),
        ({"description": "x" * 2001}, 422, "validation_error"),
        ({"starts_at": "2026-10-20T18:00:00"}, 422, "validation_error"),
        ({"duration_minutes": 0}, 422, "validation_error"),
        ({"duration_minutes": -1}, 422, "validation_error"),
        ({"duration_minutes": 1.5}, 422, "validation_error"),
        ({"duration_minutes": "60"}, 422, "validation_error"),
        ({"duration_minutes": 2147483648}, 422, "validation_error"),
        ({"teacher_id": str(uuid4())}, 422, "validation_error"),
    ],
)
async def test_lesson_request_validation(
    api_context: ApiTestContext,
    changes: dict[str, object],
    expected_status: int,
    expected_code: str,
) -> None:
    _, teacher_token = await register_and_login(api_context, "TEACHER")
    student, student_token = await register_and_login(api_context, "STUDENT")
    await connect(api_context, teacher_token, student_token)

    response = await api_context.client.post(
        "/api/v1/lessons",
        headers=authorization(teacher_token),
        json=lesson_payload(student["id"], **changes),
    )

    assert response.status_code == expected_status
    assert response.json()["error"]["code"] == expected_code
    assert await lesson_count(api_context) == 0


@pytest.mark.parametrize("missing_field", ["student_id", "title", "starts_at", "duration_minutes"])
async def test_required_lesson_fields(
    api_context: ApiTestContext,
    missing_field: str,
) -> None:
    _, teacher_token = await register_and_login(api_context, "TEACHER")
    student, student_token = await register_and_login(api_context, "STUDENT")
    await connect(api_context, teacher_token, student_token)
    payload = lesson_payload(student["id"])
    payload.pop(missing_field)

    response = await api_context.client.post(
        "/api/v1/lessons", headers=authorization(teacher_token), json=payload
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert await lesson_count(api_context) == 0


async def test_invalid_student_uuid_is_validation_error(api_context: ApiTestContext) -> None:
    _, teacher_token = await register_and_login(api_context, "TEACHER")
    response = await api_context.client.post(
        "/api/v1/lessons",
        headers=authorization(teacher_token),
        json=lesson_payload("not-a-uuid"),
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert await lesson_count(api_context) == 0


async def test_past_rejected_and_exact_now_allowed(
    api_context: ApiTestContext,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fixed_now = datetime(2026, 10, 20, 15, tzinfo=UTC)
    monkeypatch.setattr("app.services.lessons.utc_now", lambda: fixed_now)
    _, teacher_token = await register_and_login(api_context, "TEACHER")
    student, student_token = await register_and_login(api_context, "STUDENT")
    await connect(api_context, teacher_token, student_token)

    past = await api_context.client.post(
        "/api/v1/lessons",
        headers=authorization(teacher_token),
        json=lesson_payload(
            student["id"],
            starts_at=(fixed_now - timedelta(microseconds=1)).isoformat(),
        ),
    )
    boundary = await api_context.client.post(
        "/api/v1/lessons",
        headers=authorization(teacher_token),
        json=lesson_payload(student["id"], starts_at="2026-10-20T18:00:00+03:00"),
    )

    assert past.status_code == 400
    assert past.json()["error"]["code"] == "lesson_start_in_past"
    assert boundary.status_code == 201
    assert await lesson_count(api_context) == 1


async def test_unavailable_students_share_private_not_found_semantics(
    api_context: ApiTestContext,
) -> None:
    _, teacher_token = await register_and_login(api_context, "TEACHER")
    foreign_student, _ = await register_and_login(api_context, "STUDENT")

    foreign = await api_context.client.post(
        "/api/v1/lessons",
        headers=authorization(teacher_token),
        json=lesson_payload(foreign_student["id"]),
    )
    missing = await api_context.client.post(
        "/api/v1/lessons",
        headers=authorization(teacher_token),
        json=lesson_payload(str(uuid4())),
    )

    assert foreign.status_code == missing.status_code == 404
    assert foreign.json()["error"]["code"] == "student_not_available"
    assert missing.json()["error"]["code"] == "student_not_available"
    assert await lesson_count(api_context) == 0


async def test_create_lesson_requires_teacher(api_context: ApiTestContext) -> None:
    student, student_token = await register_and_login(api_context, "STUDENT")
    payload = lesson_payload(student["id"])
    forbidden = await api_context.client.post(
        "/api/v1/lessons", headers=authorization(student_token), json=payload
    )
    unauthenticated = await api_context.client.post("/api/v1/lessons", json=payload)

    assert forbidden.status_code == 403
    assert unauthenticated.status_code == 401
    assert await lesson_count(api_context) == 0


async def test_inactive_relation_is_not_available(api_context: ApiTestContext) -> None:
    _, teacher_token = await register_and_login(api_context, "TEACHER")
    student, student_token = await register_and_login(api_context, "STUDENT")
    await connect(api_context, teacher_token, student_token)
    relation = await api_context.session.scalar(
        select(TeacherStudentRelation).where(
            TeacherStudentRelation.student_id == UUID(student["id"])
        )
    )
    assert relation is not None
    relation.status = RelationStatus.INACTIVE
    relation.deactivated_at = utc_now()
    await api_context.session.commit()

    response = await api_context.client.post(
        "/api/v1/lessons",
        headers=authorization(teacher_token),
        json=lesson_payload(student["id"]),
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "student_not_available"
    assert await lesson_count(api_context) == 0


async def test_admin_cannot_create_lesson(api_context: ApiTestContext) -> None:
    email = f"admin-{uuid4().hex}@example.com"
    admin = User(
        email=email,
        password_hash=PasswordService().hash(PASSWORD),
        role=RoleCode.ADMIN,
        is_active=True,
    )
    admin.profile = Profile(first_name="Admin", last_name="Example", timezone="Europe/Moscow")
    api_context.session.add(admin)
    await api_context.session.commit()
    login = await api_context.client.post(
        "/api/v1/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert login.status_code == 200

    response = await api_context.client.post(
        "/api/v1/lessons",
        headers=authorization(login.json()["access_token"]),
        json=lesson_payload(str(uuid4())),
    )

    assert response.status_code == 403
    assert await lesson_count(api_context) == 0
