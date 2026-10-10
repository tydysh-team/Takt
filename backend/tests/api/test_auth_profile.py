from typing import Protocol
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import PasswordService, TokenService
from app.models.refresh_session import RefreshSession
from app.models.user import User

pytestmark = [pytest.mark.asyncio, pytest.mark.postgresql]

PASSWORD = "StrongPass!123"


class ApiTestContext(Protocol):
    client: httpx.AsyncClient
    session: AsyncSession


def unique_email(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex}@example.com"


async def register_user(
    context: ApiTestContext,
    *,
    role: str = "TEACHER",
    email: str | None = None,
) -> tuple[str, httpx.Response]:
    resolved_email = email or unique_email(role.lower())
    response = await context.client.post(
        "/api/v1/auth/register",
        json={
            "email": resolved_email,
            "password": PASSWORD,
            "first_name": "Ada",
            "last_name": "Lovelace",
            "role": role,
        },
    )
    return resolved_email, response


async def login_user(
    context: ApiTestContext,
    email: str,
    password: str = PASSWORD,
) -> httpx.Response:
    return await context.client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )


async def authenticated_context(
    context: ApiTestContext,
    *,
    role: str = "TEACHER",
) -> tuple[str, str]:
    email, registration = await register_user(context, role=role)
    assert registration.status_code == 201
    login_response = await login_user(context, email)
    assert login_response.status_code == 200
    return email, login_response.json()["access_token"]


def cookie_value(context: ApiTestContext, name: str) -> str:
    value = context.client.cookies.get(name)
    assert value is not None
    return value


async def test_registration_teacher_succeeds(api_context: ApiTestContext) -> None:
    email, response = await register_user(api_context, role="TEACHER")

    assert response.status_code == 201
    assert response.json()["email"] == email
    assert response.json()["role"] == "TEACHER"
    assert "password_hash" not in response.json()


async def test_registration_student_succeeds(api_context: ApiTestContext) -> None:
    _, response = await register_user(api_context, role="STUDENT")

    assert response.status_code == 201
    assert response.json()["role"] == "STUDENT"


async def test_admin_public_registration_is_rejected(api_context: ApiTestContext) -> None:
    _, response = await register_user(api_context, role="ADMIN")

    assert response.status_code == 422


async def test_weak_password_is_rejected(api_context: ApiTestContext) -> None:
    response = await api_context.client.post(
        "/api/v1/auth/register",
        json={
            "email": unique_email("weak"),
            "password": "weakpassword",
            "first_name": "Ada",
            "last_name": "Lovelace",
            "role": "STUDENT",
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


async def test_duplicate_normalized_email_is_rejected(api_context: ApiTestContext) -> None:
    email = unique_email("duplicate")
    _, first_response = await register_user(api_context, email=email)
    _, second_response = await register_user(api_context, email=f"  {email.upper()}  ")

    assert first_response.status_code == 201
    assert second_response.status_code == 409


async def test_password_is_persisted_as_argon2id_hash(api_context: ApiTestContext) -> None:
    email, response = await register_user(api_context)
    assert response.status_code == 201

    user = await api_context.session.scalar(select(User).where(User.email == email))
    assert user is not None
    assert user.password_hash != PASSWORD
    assert user.password_hash.startswith("$argon2id$")
    assert PasswordService().verify(user.password_hash, PASSWORD)


async def test_login_succeeds_and_sets_refresh_and_csrf_cookies(
    api_context: ApiTestContext,
) -> None:
    email, _ = await register_user(api_context)
    response = await login_user(api_context, email)

    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"
    assert response.json()["expires_in"] == 900
    assert api_context.client.cookies.get("takt_refresh")
    assert api_context.client.cookies.get("takt_csrf")


async def test_wrong_password_is_rejected(api_context: ApiTestContext) -> None:
    email, _ = await register_user(api_context)
    response = await login_user(api_context, email, "WrongPass!123")

    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Неверный email или пароль"


async def test_unknown_email_has_same_public_error(api_context: ApiTestContext) -> None:
    response = await login_user(api_context, unique_email("unknown"))

    assert response.status_code == 401
    assert response.json()["error"] == {
        "code": "invalid_credentials",
        "message": "Неверный email или пароль",
        "details": [],
    }


async def test_me_without_access_token_is_rejected(api_context: ApiTestContext) -> None:
    response = await api_context.client.get("/api/v1/auth/me")

    assert response.status_code == 401


async def test_me_with_valid_access_token_succeeds(api_context: ApiTestContext) -> None:
    email, access_token = await authenticated_context(api_context)
    response = await api_context.client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    assert response.json()["email"] == email
    assert response.json()["first_name"] == "Ada"


async def test_refresh_rotates_tokens(api_context: ApiTestContext) -> None:
    email, _ = await register_user(api_context)
    await login_user(api_context, email)
    old_refresh = cookie_value(api_context, "takt_refresh")
    csrf = cookie_value(api_context, "takt_csrf")

    response = await api_context.client.post(
        "/api/v1/auth/refresh",
        headers={"X-CSRF-Token": csrf},
    )

    assert response.status_code == 200
    assert cookie_value(api_context, "takt_refresh") != old_refresh
    assert cookie_value(api_context, "takt_csrf") != csrf


async def test_old_refresh_token_cannot_be_used_after_rotation(
    api_context: ApiTestContext,
) -> None:
    email, _ = await register_user(api_context)
    await login_user(api_context, email)
    old_refresh = cookie_value(api_context, "takt_refresh")
    old_csrf = cookie_value(api_context, "takt_csrf")
    await api_context.client.post(
        "/api/v1/auth/refresh",
        headers={"X-CSRF-Token": old_csrf},
    )
    current_csrf = cookie_value(api_context, "takt_csrf")
    response = await api_context.client.post(
        "/api/v1/auth/refresh",
        headers={
            "X-CSRF-Token": current_csrf,
            "Cookie": f"takt_refresh={old_refresh}; takt_csrf={current_csrf}",
        },
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "authentication_required"


async def test_refresh_replay_revokes_active_session_family(
    api_context: ApiTestContext,
) -> None:
    email, _ = await register_user(api_context)
    await login_user(api_context, email)
    old_refresh = cookie_value(api_context, "takt_refresh")
    old_csrf = cookie_value(api_context, "takt_csrf")
    await api_context.client.post(
        "/api/v1/auth/refresh",
        headers={"X-CSRF-Token": old_csrf},
    )
    rotated_refresh = cookie_value(api_context, "takt_refresh")
    rotated_csrf = cookie_value(api_context, "takt_csrf")
    replay_response = await api_context.client.post(
        "/api/v1/auth/refresh",
        headers={
            "X-CSRF-Token": rotated_csrf,
            "Cookie": f"takt_refresh={old_refresh}; takt_csrf={rotated_csrf}",
        },
    )
    assert replay_response.status_code == 401

    family_response = await api_context.client.post(
        "/api/v1/auth/refresh",
        headers={
            "X-CSRF-Token": rotated_csrf,
            "Cookie": f"takt_refresh={rotated_refresh}; takt_csrf={rotated_csrf}",
        },
    )

    assert family_response.status_code == 401


async def test_refresh_without_csrf_is_rejected(api_context: ApiTestContext) -> None:
    email, _ = await register_user(api_context)
    await login_user(api_context, email)

    response = await api_context.client.post("/api/v1/auth/refresh")

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "csrf_failed"


async def test_logout_revokes_refresh_session(api_context: ApiTestContext) -> None:
    email, _ = await register_user(api_context)
    await login_user(api_context, email)
    raw_refresh = cookie_value(api_context, "takt_refresh")
    csrf = cookie_value(api_context, "takt_csrf")
    token_hash = TokenService(get_settings()).digest_refresh_token(raw_refresh)

    response = await api_context.client.post(
        "/api/v1/auth/logout",
        headers={"X-CSRF-Token": csrf},
    )

    assert response.status_code == 204
    refresh_session = await api_context.session.scalar(
        select(RefreshSession).where(RefreshSession.token_hash == token_hash)
    )
    assert refresh_session is not None
    assert refresh_session.revoked_at is not None


async def test_get_profile_succeeds(api_context: ApiTestContext) -> None:
    email, access_token = await authenticated_context(api_context)
    response = await api_context.client.get(
        "/api/v1/profile",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "first_name": "Ada",
        "last_name": "Lovelace",
        "email": email,
        "role": "TEACHER",
        "bio": None,
        "timezone": "UTC",
    }


async def test_patch_profile_updates_allowed_fields(api_context: ApiTestContext) -> None:
    _, access_token = await authenticated_context(api_context)
    response = await api_context.client.patch(
        "/api/v1/profile",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"first_name": "Grace", "bio": "Teacher", "timezone": "Europe/Samara"},
    )

    assert response.status_code == 200
    assert response.json()["first_name"] == "Grace"
    assert response.json()["bio"] == "Teacher"
    assert response.json()["timezone"] == "Europe/Samara"


async def test_profile_rejects_email_and_role_changes(api_context: ApiTestContext) -> None:
    _, access_token = await authenticated_context(api_context)
    response = await api_context.client.patch(
        "/api/v1/profile",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"email": "changed@example.com", "role": "ADMIN"},
    )

    assert response.status_code == 422


async def test_login_rate_limit_is_enforced(api_context: ApiTestContext) -> None:
    settings = get_settings()
    responses = [
        await login_user(api_context, unique_email("rate-limit"))
        for _ in range(settings.login_rate_limit + 1)
    ]

    assert responses[-1].status_code == 429
    assert responses[-1].json()["error"]["code"] == "rate_limit_exceeded"
