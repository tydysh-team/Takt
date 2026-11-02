from datetime import timedelta
from typing import Protocol
from uuid import uuid4

import httpx
import pyotp
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import PasswordService, utc_now
from app.models.enums import RoleCode
from app.models.mfa import MfaBackupCode, MfaChallenge, UserTotp
from app.models.profile import Profile
from app.models.refresh_session import RefreshSession
from app.models.user import User

pytestmark = [pytest.mark.asyncio, pytest.mark.postgresql]

PASSWORD = "StrongPass!123"
BASE = "/api/v1/auth"


class ApiTestContext(Protocol):
    client: httpx.AsyncClient
    session: AsyncSession


async def account(context: ApiTestContext, role: RoleCode = RoleCode.TEACHER) -> tuple[User, str]:
    user = User(
        email=f"mfa-{uuid4().hex}@example.com",
        password_hash=PasswordService().hash(PASSWORD),
        role=role,
        is_active=True,
    )
    user.profile = Profile(first_name="Ada", last_name="Example", timezone="Europe/Moscow")
    context.session.add(user)
    await context.session.commit()
    response = await context.client.post(
        f"{BASE}/login", json={"email": user.email, "password": PASSWORD}
    )
    assert response.status_code == 200
    return user, response.json()["access_token"]


def headers(context: ApiTestContext, token: str) -> dict[str, str]:
    csrf = context.client.cookies.get("takt_csrf")
    assert csrf is not None
    return {"Authorization": f"Bearer {token}", "X-CSRF-Token": csrf}


async def setup(context: ApiTestContext, token: str) -> tuple[str, list[str]]:
    started = await context.client.post(
        f"{BASE}/mfa/setup",
        headers=headers(context, token),
        json={"current_password": PASSWORD},
    )
    assert started.status_code == 200, started.text
    secret = started.json()["secret"]
    assert started.json()["provisioning_uri"].startswith("otpauth://totp/Takt:")
    confirmed = await context.client.post(
        f"{BASE}/mfa/confirm",
        headers=headers(context, token),
        json={"code": pyotp.TOTP(secret).now()},
    )
    assert confirmed.status_code == 200, confirmed.text
    return secret, confirmed.json()["backup_codes"]


@pytest.mark.parametrize("role", list(RoleCode))
async def test_enable_and_login_requires_second_factor(
    api_context: ApiTestContext, role: RoleCode
) -> None:
    user, token = await account(api_context, role)
    old_refresh = api_context.client.cookies.get("takt_refresh")
    old_csrf = api_context.client.cookies.get("takt_csrf")
    assert old_refresh and old_csrf
    started = await api_context.client.post(
        f"{BASE}/mfa/setup",
        headers=headers(api_context, token),
        json={"current_password": PASSWORD},
    )
    assert started.status_code == 200
    secret = started.json()["secret"]
    state = await api_context.session.get(UserTotp, user.id)
    assert state is not None and secret not in state.pending_secret
    assert (
        await api_context.client.get(
            f"{BASE}/mfa/status", headers={"Authorization": f"Bearer {token}"}
        )
    ).json() == {"enabled": False}
    wrong = await api_context.client.post(
        f"{BASE}/mfa/confirm", headers=headers(api_context, token), json={"code": "000000"}
    )
    assert wrong.status_code == 400
    confirmed = await api_context.client.post(
        f"{BASE}/mfa/confirm",
        headers=headers(api_context, token),
        json={"code": pyotp.TOTP(secret).now()},
    )
    assert confirmed.status_code == 200, confirmed.text
    codes = confirmed.json()["backup_codes"]
    assert len(codes) == len(set(codes)) == 10
    await api_context.session.refresh(state)
    assert state.pending_secret is None and state.enabled_at is not None
    assert secret not in state.encrypted_secret
    backups = (
        await api_context.session.scalars(
            select(MfaBackupCode).where(MfaBackupCode.user_id == user.id)
        )
    ).all()
    assert len(backups) == 10
    assert all(item.code_digest not in codes for item in backups)
    sessions = (
        await api_context.session.scalars(
            select(RefreshSession).where(RefreshSession.user_id == user.id)
        )
    ).all()
    assert sessions and all(item.revoked_at is not None for item in sessions)
    assert api_context.client.cookies.get("takt_refresh") is None
    api_context.client.cookies.set("takt_refresh", old_refresh, path="/api/v1/auth")
    api_context.client.cookies.set("takt_csrf", old_csrf, path="/")
    refresh = await api_context.client.post(f"{BASE}/refresh", headers={"X-CSRF-Token": old_csrf})
    assert refresh.status_code == 401
    api_context.client.cookies.clear()
    login = await api_context.client.post(
        f"{BASE}/login", json={"email": user.email, "password": PASSWORD}
    )
    assert login.status_code == 200
    assert login.json()["mfa_required"] is True
    assert "access_token" not in login.json()
    assert api_context.client.cookies.get("takt_refresh") is None
    assert (await api_context.client.get("/api/v1/me")).status_code == 401
    verified = await api_context.client.post(
        f"{BASE}/mfa/verify", json={"challenge": login.json()["challenge"], "code": codes[0]}
    )
    assert verified.status_code == 200, verified.text
    assert verified.json()["access_token"]
    assert api_context.client.cookies.get("takt_refresh")
    replay = await api_context.client.post(
        f"{BASE}/mfa/verify", json={"challenge": login.json()["challenge"], "code": codes[1]}
    )
    assert replay.status_code == 401


async def test_expired_challenge_and_limited_attempts(api_context: ApiTestContext) -> None:
    user, token = await account(api_context)
    _, codes = await setup(api_context, token)
    login = await api_context.client.post(
        f"{BASE}/login", json={"email": user.email, "password": PASSWORD}
    )
    challenge_value = login.json()["challenge"]
    for _ in range(5):
        response = await api_context.client.post(
            f"{BASE}/mfa/verify", json={"challenge": challenge_value, "code": "000000"}
        )
        assert response.status_code == 400
    blocked = await api_context.client.post(
        f"{BASE}/mfa/verify", json={"challenge": challenge_value, "code": codes[0]}
    )
    assert blocked.status_code in (401, 429)
    challenge = await api_context.session.scalar(
        select(MfaChallenge).where(MfaChallenge.user_id == user.id)
    )
    assert challenge is not None and challenge.attempts == 5
    challenge.expires_at = utc_now() - timedelta(seconds=1)
    await api_context.session.commit()
    expired = await api_context.client.post(
        f"{BASE}/mfa/verify", json={"challenge": challenge_value, "code": codes[0]}
    )
    assert expired.status_code in (401, 429)


async def test_backup_codes_are_one_use_and_regeneration_replaces_them(
    api_context: ApiTestContext,
) -> None:
    user, token = await account(api_context)
    _, codes = await setup(api_context, token)
    login = await api_context.client.post(
        f"{BASE}/login", json={"email": user.email, "password": PASSWORD}
    )
    verified = await api_context.client.post(
        f"{BASE}/mfa/verify", json={"challenge": login.json()["challenge"], "code": codes[0]}
    )
    assert verified.status_code == 200
    fresh_token = verified.json()["access_token"]
    generated = await api_context.client.post(
        f"{BASE}/mfa/backup-codes/regenerate",
        headers=headers(api_context, fresh_token),
        json={"current_password": PASSWORD, "code": codes[1]},
    )
    assert generated.status_code == 200, generated.text
    replacements = generated.json()["backup_codes"]
    assert len(replacements) == 10
    login_again = await api_context.client.post(
        f"{BASE}/login", json={"email": user.email, "password": PASSWORD}
    )
    reused = await api_context.client.post(
        f"{BASE}/mfa/verify", json={"challenge": login_again.json()["challenge"], "code": codes[0]}
    )
    assert reused.status_code == 400
    old_code = await api_context.client.post(
        f"{BASE}/mfa/verify", json={"challenge": login_again.json()["challenge"], "code": codes[2]}
    )
    assert old_code.status_code == 400
    new_code = await api_context.client.post(
        f"{BASE}/mfa/verify",
        json={"challenge": login_again.json()["challenge"], "code": replacements[0]},
    )
    assert new_code.status_code == 200


async def test_disable_requires_password_code_and_csrf(api_context: ApiTestContext) -> None:
    user, token = await account(api_context)
    _, codes = await setup(api_context, token)
    login = await api_context.client.post(
        f"{BASE}/login", json={"email": user.email, "password": PASSWORD}
    )
    verified = await api_context.client.post(
        f"{BASE}/mfa/verify", json={"challenge": login.json()["challenge"], "code": codes[0]}
    )
    fresh_token = verified.json()["access_token"]
    no_csrf = await api_context.client.post(
        f"{BASE}/mfa/disable",
        headers={"Authorization": f"Bearer {fresh_token}"},
        json={"current_password": PASSWORD, "code": codes[1]},
    )
    assert no_csrf.status_code == 403
    wrong_password = await api_context.client.post(
        f"{BASE}/mfa/disable",
        headers=headers(api_context, fresh_token),
        json={"current_password": "wrong", "code": codes[1]},
    )
    assert wrong_password.status_code == 400
    disabled = await api_context.client.post(
        f"{BASE}/mfa/disable",
        headers=headers(api_context, fresh_token),
        json={"current_password": PASSWORD, "code": codes[1]},
    )
    assert disabled.status_code == 204
    assert await api_context.session.get(UserTotp, user.id) is None
    assert not (
        await api_context.session.scalars(
            select(MfaBackupCode).where(MfaBackupCode.user_id == user.id)
        )
    ).all()
    password_only = await api_context.client.post(
        f"{BASE}/login", json={"email": user.email, "password": PASSWORD}
    )
    assert "access_token" in password_only.json()


async def test_setup_rejects_unauthorized_and_wrong_password(api_context: ApiTestContext) -> None:
    _, token = await account(api_context)
    path = f"{BASE}/mfa/setup"
    missing_access = await api_context.client.post(
        path,
        headers={"X-CSRF-Token": api_context.client.cookies.get("takt_csrf") or ""},
        json={"current_password": PASSWORD},
    )
    assert missing_access.status_code == 401
    wrong_password = await api_context.client.post(
        path, headers=headers(api_context, token), json={"current_password": "wrong"}
    )
    assert wrong_password.status_code == 400


async def test_totp_login_accepts_next_step_once(api_context: ApiTestContext) -> None:
    user, token = await account(api_context)
    secret, _ = await setup(api_context, token)
    next_code = pyotp.TOTP(secret).at(utc_now() + timedelta(seconds=30))
    first = await api_context.client.post(
        f"{BASE}/login", json={"email": user.email, "password": PASSWORD}
    )
    verified = await api_context.client.post(
        f"{BASE}/mfa/verify",
        json={"challenge": first.json()["challenge"], "code": next_code},
    )
    assert verified.status_code == 200
    second = await api_context.client.post(
        f"{BASE}/login", json={"email": user.email, "password": PASSWORD}
    )
    replay = await api_context.client.post(
        f"{BASE}/mfa/verify",
        json={"challenge": second.json()["challenge"], "code": next_code},
    )
    assert replay.status_code == 400
    assert replay.json()["error"]["code"] == "mfa_invalid_code"


async def test_pending_setup_expires(api_context: ApiTestContext) -> None:
    user, token = await account(api_context)
    started = await api_context.client.post(
        f"{BASE}/mfa/setup", headers=headers(api_context, token),
        json={"current_password": PASSWORD},
    )
    assert started.status_code == 200
    state = await api_context.session.get(UserTotp, user.id)
    assert state is not None
    state.pending_expires_at = utc_now() - timedelta(seconds=1)
    await api_context.session.commit()
    expired = await api_context.client.post(
        f"{BASE}/mfa/confirm", headers=headers(api_context, token),
        json={"code": pyotp.TOTP(started.json()["secret"]).now()},
    )
    assert expired.status_code == 400
    assert expired.json()["error"]["code"] == "mfa_setup_expired"
    await api_context.session.refresh(state)
    assert state.pending_secret is None


async def test_expired_challenge_cannot_be_used(api_context: ApiTestContext) -> None:
    user, token = await account(api_context)
    _, codes = await setup(api_context, token)
    login = await api_context.client.post(
        f"{BASE}/login", json={"email": user.email, "password": PASSWORD}
    )
    challenge = await api_context.session.scalar(
        select(MfaChallenge).where(MfaChallenge.user_id == user.id)
    )
    assert challenge is not None
    challenge.expires_at = utc_now() - timedelta(seconds=1)
    await api_context.session.commit()
    expired = await api_context.client.post(
        f"{BASE}/mfa/verify",
        json={"challenge": login.json()["challenge"], "code": codes[0]},
    )
    assert expired.status_code == 401
    assert expired.json()["error"]["code"] == "mfa_challenge_invalid"
    assert api_context.client.cookies.get("takt_refresh") is None


async def test_missing_encryption_key_fails_closed(
    api_context: ApiTestContext, monkeypatch: pytest.MonkeyPatch
) -> None:
    user, token = await account(api_context)
    await setup(api_context, token)
    monkeypatch.setattr(get_settings(), "totp_encryption_key", None)
    response = await api_context.client.post(
        f"{BASE}/login", json={"email": user.email, "password": PASSWORD}
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "mfa_unavailable"
    assert "access_token" not in response.json()


async def test_activation_commit_failure_rolls_back_secret_codes_and_revocation(
    api_context: ApiTestContext, monkeypatch: pytest.MonkeyPatch
) -> None:
    user, token = await account(api_context)
    started = await api_context.client.post(
        f"{BASE}/mfa/setup", headers=headers(api_context, token),
        json={"current_password": PASSWORD},
    )
    assert started.status_code == 200

    async def broken_commit() -> None:
        raise RuntimeError("Simulated commit failure")

    user_id = user.id
    monkeypatch.setattr(api_context.session, "commit", broken_commit)
    with pytest.raises(RuntimeError, match="Simulated commit failure"):
        await api_context.client.post(
            f"{BASE}/mfa/confirm", headers=headers(api_context, token),
            json={"code": pyotp.TOTP(started.json()["secret"]).now()},
        )
    state = await api_context.session.get(UserTotp, user_id)
    assert state is not None and state.enabled_at is None and state.pending_secret is not None
    backups = (await api_context.session.scalars(
        select(MfaBackupCode).where(MfaBackupCode.user_id == user_id)
    )).all()
    sessions = (await api_context.session.scalars(
        select(RefreshSession).where(RefreshSession.user_id == user_id)
    )).all()
    assert backups == []
    assert len(sessions) == 1 and sessions[0].revoked_at is None
