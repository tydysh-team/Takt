from typing import Protocol
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import PasswordService
from app.models.enums import RoleCode
from app.models.profile import Profile
from app.models.refresh_session import RefreshSession
from app.models.user import User

pytestmark = [pytest.mark.asyncio, pytest.mark.postgresql]

OLD_PASSWORD = "OldPassword123"
NEW_PASSWORD = "NewPassword456"


class ApiTestContext(Protocol):
    client: httpx.AsyncClient
    session: AsyncSession


async def account(context: ApiTestContext, role: RoleCode) -> tuple[User, str]:
    user = User(
        email=f"password-{uuid4().hex}@example.com",
        password_hash=PasswordService().hash(OLD_PASSWORD),
        role=role,
        is_active=True,
    )
    user.profile = Profile(first_name="Ada", last_name="Example", timezone="Europe/Moscow")
    context.session.add(user)
    await context.session.commit()
    login = await context.client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": OLD_PASSWORD},
    )
    assert login.status_code == 200
    return user, login.json()["access_token"]


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def csrf(context: ApiTestContext) -> dict[str, str]:
    value = context.client.cookies.get("takt_csrf")
    assert value is not None
    return {"X-CSRF-Token": value}


def body(current: str = OLD_PASSWORD, new: str = NEW_PASSWORD) -> dict[str, str]:
    return {"current_password": current, "new_password": new}


@pytest.mark.parametrize("role", list(RoleCode))
async def test_change_password_revokes_all_refresh_sessions_and_allows_new_login(
    api_context: ApiTestContext, role: RoleCode,
) -> None:
    user, token = await account(api_context, role)
    email = user.email
    first_refresh = api_context.client.cookies.get("takt_refresh")
    assert first_refresh is not None
    second_login = await api_context.client.post(
        "/api/v1/auth/login", json={"email": email, "password": OLD_PASSWORD}
    )
    assert second_login.status_code == 200
    second_refresh = api_context.client.cookies.get("takt_refresh")
    assert second_refresh is not None and second_refresh != first_refresh
    response = await api_context.client.post(
        "/api/v1/auth/change-password",
        headers={**auth(token), **csrf(api_context)},
        json=body(),
    )
    await api_context.session.refresh(user)
    sessions = (await api_context.session.scalars(
        select(RefreshSession).where(RefreshSession.user_id == user.id)
    )).all()

    assert response.status_code == 204
    assert response.content == b""
    assert user.password_hash.startswith("$argon2id$")
    assert PasswordService().verify(user.password_hash, NEW_PASSWORD)
    assert len(sessions) == 2
    assert all(item.revoked_at is not None for item in sessions)
    assert api_context.client.cookies.get("takt_refresh") is None
    assert api_context.client.cookies.get("takt_csrf") is None
    existing_access = await api_context.client.get("/api/v1/me", headers=auth(token))
    assert existing_access.status_code == 200

    old_login = await api_context.client.post(
        "/api/v1/auth/login", json={"email": email, "password": OLD_PASSWORD}
    )
    new_login = await api_context.client.post(
        "/api/v1/auth/login", json={"email": email, "password": NEW_PASSWORD}
    )
    assert old_login.status_code == 401
    assert new_login.status_code == 200


@pytest.mark.parametrize(
    ("payload", "status", "code"),
    [
        (body("wrong-password"), 400, "current_password_invalid"),
        (body(new=OLD_PASSWORD), 409, "password_unchanged"),
        (body(new="short"), 422, "validation_error"),
        ({**body(), "extra": "no"}, 422, "validation_error"),
    ],
)
async def test_change_password_rejects_invalid_input_without_mutation(
    api_context: ApiTestContext, payload: dict[str, str], status: int, code: str,
) -> None:
    user, token = await account(api_context, RoleCode.TEACHER)
    original_hash = user.password_hash
    response = await api_context.client.post(
        "/api/v1/auth/change-password",
        headers={**auth(token), **csrf(api_context)},
        json=payload,
    )
    await api_context.session.refresh(user)
    sessions = (await api_context.session.scalars(
        select(RefreshSession).where(RefreshSession.user_id == user.id)
    )).all()
    assert response.status_code == status
    assert response.json()["error"]["code"] == code
    assert user.password_hash == original_hash
    assert len(sessions) == 1 and sessions[0].revoked_at is None


async def test_change_password_requires_access_and_csrf(api_context: ApiTestContext) -> None:
    _, token = await account(api_context, RoleCode.STUDENT)
    path = "/api/v1/auth/change-password"
    unauthenticated = await api_context.client.post(path, headers=csrf(api_context), json=body())
    missing_csrf = await api_context.client.post(path, headers=auth(token), json=body())
    assert unauthenticated.status_code == 401
    assert missing_csrf.status_code == 403
    assert missing_csrf.json()["error"]["code"] == "csrf_failed"


async def test_change_password_rate_limit(api_context: ApiTestContext) -> None:
    _, token = await account(api_context, RoleCode.TEACHER)
    path = "/api/v1/auth/change-password"
    for _ in range(get_settings().login_rate_limit):
        response = await api_context.client.post(
            path, headers={**auth(token), **csrf(api_context)}, json=body("wrong-password")
        )
        assert response.status_code == 400
    blocked = await api_context.client.post(
        path, headers={**auth(token), **csrf(api_context)}, json=body("wrong-password")
    )
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "rate_limit_exceeded"


async def test_change_password_rolls_back_hash_and_revocations_on_commit_failure(
    api_context: ApiTestContext, monkeypatch: pytest.MonkeyPatch,
) -> None:
    user, token = await account(api_context, RoleCode.TEACHER)
    original_hash = user.password_hash

    async def broken_commit() -> None:
        raise RuntimeError("Simulated commit failure")

    monkeypatch.setattr(api_context.session, "commit", broken_commit)
    with pytest.raises(RuntimeError, match="Simulated commit failure"):
        await api_context.client.post(
            "/api/v1/auth/change-password",
            headers={**auth(token), **csrf(api_context)}, json=body(),
        )
    await api_context.session.refresh(user)
    sessions = (await api_context.session.scalars(
        select(RefreshSession).where(RefreshSession.user_id == user.id)
    )).all()
    assert user.password_hash == original_hash
    assert len(sessions) == 1 and sessions[0].revoked_at is None


async def test_revoked_refresh_cannot_rotate_after_change(api_context: ApiTestContext) -> None:
    user, token = await account(api_context, RoleCode.TEACHER)
    refresh_token = api_context.client.cookies.get("takt_refresh")
    csrf_token = api_context.client.cookies.get("takt_csrf")
    assert refresh_token is not None and csrf_token is not None
    changed = await api_context.client.post(
        "/api/v1/auth/change-password",
        headers={**auth(token), "X-CSRF-Token": csrf_token}, json=body(),
    )
    assert changed.status_code == 204
    api_context.client.cookies.set("takt_refresh", refresh_token, path="/api/v1/auth")
    api_context.client.cookies.set("takt_csrf", csrf_token, path="/")
    rejected = await api_context.client.post(
        "/api/v1/auth/refresh", headers={"X-CSRF-Token": csrf_token}
    )
    assert rejected.status_code == 401
    assert rejected.json()["error"]["code"] == "authentication_required"
