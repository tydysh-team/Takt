from datetime import timedelta
from typing import Protocol, cast
from uuid import UUID, uuid4

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import PasswordService, utc_now
from app.models.enums import RoleCode
from app.models.profile import Profile
from app.models.teacher_invitation import TeacherInvitation
from app.models.user import User

pytestmark = [pytest.mark.asyncio, pytest.mark.postgresql]

PASSWORD = "StrongPass!123"


class ApiTestContext(Protocol):
    client: httpx.AsyncClient
    session: AsyncSession


def unique_email(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex}@example.com"


async def register_and_login(
    context: ApiTestContext,
    role: str,
) -> tuple[dict[str, str], str]:
    email = unique_email(role.lower())
    registration = await context.client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": PASSWORD,
            "first_name": role.title(),
            "last_name": "Example",
            "role": role,
        },
    )
    assert registration.status_code == 201
    login = await context.client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
    )
    assert login.status_code == 200
    identity = {"id": registration.json()["id"], "email": email}
    return identity, login.json()["access_token"]


def authorization(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def create_invitation(context: ApiTestContext, teacher_token: str) -> dict[str, str]:
    response = await context.client.post(
        "/api/v1/invitations",
        headers=authorization(teacher_token),
    )
    assert response.status_code == 201
    return cast(dict[str, str], response.json())


async def connect(
    context: ApiTestContext,
    teacher_token: str,
    student_token: str,
) -> dict[str, str]:
    invitation = await create_invitation(context, teacher_token)
    response = await context.client.post(
        "/api/v1/connections/accept",
        headers=authorization(student_token),
        json={"code": invitation["code"]},
    )
    assert response.status_code == 200
    return invitation


async def test_teacher_can_create_and_list_invitation(api_context: ApiTestContext) -> None:
    _, token = await register_and_login(api_context, "TEACHER")
    created = await create_invitation(api_context, token)
    assert len(created["code"].split("-")) == 3

    response = await api_context.client.get(
        "/api/v1/invitations",
        headers=authorization(token),
    )
    assert response.status_code == 200
    assert response.json()[0]["status"] == "ACTIVE"
    assert "code" not in response.json()[0]
    assert "code_digest" not in response.json()[0]


async def test_student_cannot_create_invitation(api_context: ApiTestContext) -> None:
    _, token = await register_and_login(api_context, "STUDENT")
    response = await api_context.client.post(
        "/api/v1/invitations",
        headers=authorization(token),
    )
    assert response.status_code == 403


async def test_student_accepts_valid_invitation(api_context: ApiTestContext) -> None:
    teacher, teacher_token = await register_and_login(api_context, "TEACHER")
    _, student_token = await register_and_login(api_context, "STUDENT")
    invitation = await create_invitation(api_context, teacher_token)

    response = await api_context.client.post(
        "/api/v1/connections/accept",
        headers=authorization(student_token),
        json={"code": invitation["code"].lower().replace("-", " ")},
    )
    assert response.status_code == 200
    assert response.json()["teacher"]["id"] == teacher["id"]


async def test_teacher_cannot_accept_invitation(api_context: ApiTestContext) -> None:
    _, owner_token = await register_and_login(api_context, "TEACHER")
    _, other_teacher_token = await register_and_login(api_context, "TEACHER")
    invitation = await create_invitation(api_context, owner_token)
    response = await api_context.client.post(
        "/api/v1/connections/accept",
        headers=authorization(other_teacher_token),
        json={"code": invitation["code"]},
    )
    assert response.status_code == 403


async def test_invalid_invitation_is_rejected(api_context: ApiTestContext) -> None:
    _, token = await register_and_login(api_context, "STUDENT")
    response = await api_context.client.post(
        "/api/v1/connections/accept",
        headers=authorization(token),
        json={"code": "ABCD-EFGH-23"},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invitation_invalid"


async def test_revoked_invitation_is_rejected(api_context: ApiTestContext) -> None:
    _, teacher_token = await register_and_login(api_context, "TEACHER")
    _, student_token = await register_and_login(api_context, "STUDENT")
    invitation = await create_invitation(api_context, teacher_token)
    revoke = await api_context.client.post(
        f"/api/v1/invitations/{invitation['id']}/revoke",
        headers=authorization(teacher_token),
    )
    assert revoke.status_code == 204
    response = await api_context.client.post(
        "/api/v1/connections/accept",
        headers=authorization(student_token),
        json={"code": invitation["code"]},
    )
    assert response.status_code == 400


async def test_expired_invitation_is_rejected(api_context: ApiTestContext) -> None:
    _, teacher_token = await register_and_login(api_context, "TEACHER")
    _, student_token = await register_and_login(api_context, "STUDENT")
    invitation = await create_invitation(api_context, teacher_token)
    stored = await api_context.session.get(TeacherInvitation, UUID(invitation["id"]))
    assert stored is not None
    now = utc_now()
    stored.created_at = now - timedelta(days=8)
    stored.expires_at = now - timedelta(days=1)
    await api_context.session.commit()

    response = await api_context.client.post(
        "/api/v1/connections/accept",
        headers=authorization(student_token),
        json={"code": invitation["code"]},
    )
    assert response.status_code == 400


async def test_invitation_cannot_be_reused(api_context: ApiTestContext) -> None:
    _, teacher_token = await register_and_login(api_context, "TEACHER")
    _, first_student_token = await register_and_login(api_context, "STUDENT")
    _, second_student_token = await register_and_login(api_context, "STUDENT")
    invitation = await create_invitation(api_context, teacher_token)
    first = await api_context.client.post(
        "/api/v1/connections/accept",
        headers=authorization(first_student_token),
        json={"code": invitation["code"]},
    )
    second = await api_context.client.post(
        "/api/v1/connections/accept",
        headers=authorization(second_student_token),
        json={"code": invitation["code"]},
    )
    assert first.status_code == 200
    assert second.status_code == 400


async def test_duplicate_active_relation_is_rejected(api_context: ApiTestContext) -> None:
    _, teacher_token = await register_and_login(api_context, "TEACHER")
    _, student_token = await register_and_login(api_context, "STUDENT")
    await connect(api_context, teacher_token, student_token)
    second_invitation = await create_invitation(api_context, teacher_token)
    response = await api_context.client.post(
        "/api/v1/connections/accept",
        headers=authorization(student_token),
        json={"code": second_invitation["code"]},
    )
    assert response.status_code == 409
    stored = await api_context.session.get(
        TeacherInvitation,
        UUID(second_invitation["id"]),
    )
    assert stored is not None
    assert stored.used_at is None


async def test_teacher_lists_only_own_students(api_context: ApiTestContext) -> None:
    _, first_teacher_token = await register_and_login(api_context, "TEACHER")
    _, second_teacher_token = await register_and_login(api_context, "TEACHER")
    student, student_token = await register_and_login(api_context, "STUDENT")
    await connect(api_context, first_teacher_token, student_token)

    own = await api_context.client.get(
        "/api/v1/students",
        headers=authorization(first_teacher_token),
    )
    foreign = await api_context.client.get(
        "/api/v1/students",
        headers=authorization(second_teacher_token),
    )
    assert [item["id"] for item in own.json()] == [student["id"]]
    assert foreign.json() == []


async def test_teacher_cannot_open_foreign_student(api_context: ApiTestContext) -> None:
    _, owner_token = await register_and_login(api_context, "TEACHER")
    _, other_token = await register_and_login(api_context, "TEACHER")
    student, student_token = await register_and_login(api_context, "STUDENT")
    await connect(api_context, owner_token, student_token)
    response = await api_context.client.get(
        f"/api/v1/students/{student['id']}",
        headers=authorization(other_token),
    )
    assert response.status_code == 404


async def test_teacher_cannot_note_foreign_student(api_context: ApiTestContext) -> None:
    _, owner_token = await register_and_login(api_context, "TEACHER")
    _, other_token = await register_and_login(api_context, "TEACHER")
    student, student_token = await register_and_login(api_context, "STUDENT")
    await connect(api_context, owner_token, student_token)
    response = await api_context.client.patch(
        f"/api/v1/students/{student['id']}/note",
        headers=authorization(other_token),
        json={"note": "Private"},
    )
    assert response.status_code == 404


async def test_student_has_no_students_access(api_context: ApiTestContext) -> None:
    _, token = await register_and_login(api_context, "STUDENT")
    response = await api_context.client.get(
        "/api/v1/students",
        headers=authorization(token),
    )
    assert response.status_code == 403


async def test_student_lists_only_connected_teachers(api_context: ApiTestContext) -> None:
    teacher, teacher_token = await register_and_login(api_context, "TEACHER")
    _, other_teacher_token = await register_and_login(api_context, "TEACHER")
    _, student_token = await register_and_login(api_context, "STUDENT")
    await connect(api_context, teacher_token, student_token)
    response = await api_context.client.get(
        "/api/v1/teachers",
        headers=authorization(student_token),
    )
    assert [item["id"] for item in response.json()] == [teacher["id"]]
    assert other_teacher_token


async def test_student_cannot_open_unconnected_teacher(api_context: ApiTestContext) -> None:
    teacher, teacher_token = await register_and_login(api_context, "TEACHER")
    _, connected_student_token = await register_and_login(api_context, "STUDENT")
    _, other_student_token = await register_and_login(api_context, "STUDENT")
    await connect(api_context, teacher_token, connected_student_token)
    response = await api_context.client.get(
        f"/api/v1/teachers/{teacher['id']}",
        headers=authorization(other_student_token),
    )
    assert response.status_code == 404


async def test_teacher_note_never_appears_in_student_response(
    api_context: ApiTestContext,
) -> None:
    student, student_token = await register_and_login(api_context, "STUDENT")
    _, teacher_token = await register_and_login(api_context, "TEACHER")
    await connect(api_context, teacher_token, student_token)
    note = await api_context.client.patch(
        f"/api/v1/students/{student['id']}/note",
        headers=authorization(teacher_token),
        json={"note": "Private note"},
    )
    assert note.status_code == 200
    response = await api_context.client.get(
        "/api/v1/teachers",
        headers=authorization(student_token),
    )
    assert response.status_code == 200
    assert "teacher_note" not in response.text
    assert "Private note" not in response.text


async def test_teacher_dashboard_is_correct(api_context: ApiTestContext) -> None:
    _, teacher_token = await register_and_login(api_context, "TEACHER")
    _, student_token = await register_and_login(api_context, "STUDENT")
    await connect(api_context, teacher_token, student_token)
    await create_invitation(api_context, teacher_token)
    response = await api_context.client.get(
        "/api/v1/dashboard/summary",
        headers=authorization(teacher_token),
    )
    assert response.status_code == 200
    assert response.json()["students_count"] == 1
    assert response.json()["new_students_30d"] == 1
    assert response.json()["active_invitations_count"] == 1


async def test_student_dashboard_is_correct(api_context: ApiTestContext) -> None:
    _, teacher_token = await register_and_login(api_context, "TEACHER")
    _, student_token = await register_and_login(api_context, "STUDENT")
    await connect(api_context, teacher_token, student_token)
    response = await api_context.client.get(
        "/api/v1/dashboard/summary",
        headers=authorization(student_token),
    )
    assert response.status_code == 200
    assert response.json()["teachers_count"] == 1
    assert len(response.json()["recent_teachers"]) == 1
    assert "teacher_note" not in response.text


async def test_non_admin_cannot_authenticate_to_admin(api_context: ApiTestContext) -> None:
    identity, _ = await register_and_login(api_context, "TEACHER")
    login = await api_context.client.post(
        "/admin/login",
        data={"username": identity["email"], "password": PASSWORD},
    )
    assert login.status_code in {400, 401}
    response = await api_context.client.get("/admin/")
    assert response.status_code in {302, 307}
    assert "/admin/login" in response.headers["location"]


async def test_admin_can_authenticate_to_admin(api_context: ApiTestContext) -> None:
    email = unique_email("admin")
    admin = User(
        email=email,
        password_hash=PasswordService().hash(PASSWORD),
        role=RoleCode.ADMIN,
        is_active=True,
    )
    admin.profile = Profile(first_name="Admin", last_name="User", timezone="Europe/Moscow")
    api_context.session.add(admin)
    await api_context.session.commit()

    login = await api_context.client.post(
        "/admin/login",
        data={"username": email, "password": PASSWORD},
    )
    assert login.status_code in {302, 303}
    response = await api_context.client.get("/admin/")
    assert response.status_code == 200
    assert "Takt Administration" in response.text
