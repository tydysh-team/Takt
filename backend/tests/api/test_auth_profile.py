from datetime import timedelta
from typing import Protocol
from uuid import uuid4

import httpx
import jwt
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import PasswordService, TokenService, utc_now
from app.models.enums import RoleCode
from app.models.profile import Profile
from app.models.refresh_session import RefreshSession
from app.models.role_profiles import StudentProfile, TeacherProfile
from app.models.user import User
from app.repositories.users import UserRepository

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
    middle_name: str | None = None,
) -> tuple[str, httpx.Response]:
    resolved_email = email or unique_email(role.lower())
    response = await context.client.post(
        "/api/v1/auth/register",
        json={
            "email": resolved_email,
            "password": PASSWORD,
            "first_name": "Ada",
            "last_name": "Lovelace",
            "middle_name": middle_name,
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


@pytest.mark.parametrize(
    ("password", "expected_status"),
    [
        pytest.param("1234567", 422, id="seven-characters"),
        pytest.param("12345678", 201, id="eight-characters"),
        pytest.param("a" * 128, 201, id="one-hundred-twenty-eight-characters"),
        pytest.param("a" * 129, 422, id="one-hundred-twenty-nine-characters"),
    ],
)
async def test_registration_password_length_boundaries(
    api_context: ApiTestContext,
    password: str,
    expected_status: int,
) -> None:
    response = await api_context.client.post(
        "/api/v1/auth/register",
        json={
            "email": unique_email("password-boundary"),
            "password": password,
            "first_name": "Ada",
            "last_name": "Lovelace",
            "role": "STUDENT",
        },
    )

    assert response.status_code == expected_status
    if expected_status == 422:
        assert response.json()["error"]["code"] == "validation_error"


async def test_registration_rejects_invalid_email(api_context: ApiTestContext) -> None:
    response = await api_context.client.post(
        "/api/v1/auth/register",
        json={
            "email": "not-an-email",
            "password": "12345678",
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
    user_count = await api_context.session.scalar(
        select(func.count()).select_from(User).where(User.email == email)
    )
    user = await UserRepository(api_context.session).get_by_email(email)
    assert user_count == 1
    assert user is not None
    assert await api_context.session.get(Profile, user.id) is not None
    assert await api_context.session.get(TeacherProfile, user.id) is not None
    assert await api_context.session.get(StudentProfile, user.id) is None


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
    response = await api_context.client.get("/api/v1/me")

    assert response.status_code == 401


async def test_me_with_valid_access_token_succeeds(api_context: ApiTestContext) -> None:
    email, access_token = await authenticated_context(api_context)
    response = await api_context.client.get(
        "/api/v1/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    assert response.json()["email"] == email
    assert response.json()["first_name"] == "Ada"
    assert response.json()["role"] == "TEACHER"


async def test_old_auth_me_route_does_not_exist(api_context: ApiTestContext) -> None:
    _, access_token = await authenticated_context(api_context)
    old_route = "/api/v1/auth" + "/me"
    response = await api_context.client.get(
        old_route,
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 404


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
        "middle_name": None,
        "email": email,
        "role": "TEACHER",
        "bio": None,
        "timezone": "Europe/Moscow",
    }


async def test_patch_profile_updates_allowed_fields(api_context: ApiTestContext) -> None:
    _, access_token = await authenticated_context(api_context)
    response = await api_context.client.patch(
        "/api/v1/profile",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "first_name": "Grace",
            "last_name": "Hopper",
            "bio": "Teacher",
            "timezone": "Europe/Samara",
        },
    )

    assert response.status_code == 200
    assert response.json()["first_name"] == "Grace"
    assert response.json()["last_name"] == "Hopper"
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


async def test_registration_without_timezone_uses_backend_default(
    api_context: ApiTestContext,
) -> None:
    email = unique_email("timezone")
    response = await api_context.client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": PASSWORD,
            "first_name": "Ada",
            "last_name": "Lovelace",
            "role": "STUDENT",
        },
    )
    assert response.status_code == 201
    user = await UserRepository(api_context.session).get_by_email(email)
    assert user is not None
    profile = await api_context.session.get(Profile, user.id)
    assert profile is not None and profile.timezone == "Europe/Moscow"


async def test_registration_saves_valid_browser_timezone(api_context: ApiTestContext) -> None:
    email = unique_email("browser-timezone")
    response = await api_context.client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": PASSWORD,
            "first_name": "Ada",
            "last_name": "Lovelace",
            "role": "STUDENT",
            "timezone": "Europe/Warsaw",
        },
    )
    assert response.status_code == 201
    user = await UserRepository(api_context.session).get_by_email(email)
    assert user is not None
    profile = await api_context.session.get(Profile, user.id)
    assert profile is not None and profile.timezone == "Europe/Warsaw"


async def test_registration_rejects_timezone_field(api_context: ApiTestContext) -> None:
    response = await api_context.client.post(
        "/api/v1/auth/register",
        json={
            "email": unique_email("bad-timezone"),
            "password": PASSWORD,
            "first_name": "Ada",
            "last_name": "Lovelace",
            "role": "STUDENT",
            "timezone": "Invalid/Timezone",
        },
    )
    assert response.status_code == 422


async def test_profile_rejects_invalid_timezone(api_context: ApiTestContext) -> None:
    _, token = await authenticated_context(api_context)
    response = await api_context.client.patch(
        "/api/v1/profile",
        headers={"Authorization": f"Bearer {token}"},
        json={"timezone": "Invalid/Timezone"},
    )
    assert response.status_code == 422


async def test_invalid_and_expired_access_tokens_are_rejected(
    api_context: ApiTestContext,
) -> None:
    response = await api_context.client.get(
        "/api/v1/me", headers={"Authorization": "Bearer invalid.jwt.token"}
    )
    assert response.status_code == 401
    email, _ = await authenticated_context(api_context)
    user = await UserRepository(api_context.session).get_by_email(email)
    assert user is not None
    expired = TokenService(get_settings()).create_access_token(
        user_id=user.id, role=user.role, now=utc_now() - timedelta(days=2)
    )
    response = await api_context.client.get(
        "/api/v1/me", headers={"Authorization": f"Bearer {expired.value}"}
    )
    assert response.status_code == 401


async def test_login_rate_limit_is_enforced(api_context: ApiTestContext) -> None:
    settings = get_settings()
    responses = [
        await login_user(api_context, unique_email("rate-limit"))
        for _ in range(settings.login_rate_limit + 1)
    ]

    assert responses[-1].status_code == 429
    assert responses[-1].json()["error"]["code"] == "rate_limit_exceeded"


@pytest.mark.parametrize("role,profile_type,missing_type", [
    ("TEACHER", TeacherProfile, StudentProfile),
    ("STUDENT", StudentProfile, TeacherProfile),
])
async def test_registration_creates_role_identity_and_optional_middle_name(
    api_context: ApiTestContext,
    role: str,
    profile_type: type[TeacherProfile] | type[StudentProfile],
    missing_type: type[TeacherProfile] | type[StudentProfile],
) -> None:
    email, response = await register_user(api_context, role=role, middle_name="  Byron  ")
    assert response.status_code == 201
    assert response.json()["middle_name"] == "Byron"
    user = await UserRepository(api_context.session).get_by_email(email)
    assert user is not None
    assert user.role == RoleCode(role)
    assert await api_context.session.get(profile_type, user.id) is not None
    assert await api_context.session.get(missing_type, user.id) is None
    profile = await api_context.session.get(Profile, user.id)
    assert profile is not None and profile.middle_name == "Byron"
    assert profile.timezone == "Europe/Moscow"


async def test_middle_name_absent_or_blank_becomes_null(api_context: ApiTestContext) -> None:
    _, absent = await register_user(api_context)
    assert absent.status_code == 201
    assert absent.json()["middle_name"] is None
    _, blank = await register_user(api_context, middle_name="  ")
    assert blank.status_code == 201
    assert blank.json()["middle_name"] is None


@pytest.mark.parametrize("field", ["first_name", "last_name"])
async def test_blank_required_name_rejected(api_context: ApiTestContext, field: str) -> None:
    response = await api_context.client.post("/api/v1/auth/register", json={
        "email": unique_email("blank"), "password": PASSWORD,
        "first_name": "Ada", "last_name": "Lovelace", "role": "STUDENT", field: "  ",
    })
    assert response.status_code == 422


async def test_middle_name_can_be_set_and_removed(api_context: ApiTestContext) -> None:
    _, token = await authenticated_context(api_context)
    headers = {"Authorization": f"Bearer {token}"}
    response = await api_context.client.patch("/api/v1/profile", headers=headers,
                                              json={"middle_name": " Byron "})
    assert response.status_code == 200
    assert response.json()["middle_name"] == "Byron"
    response = await api_context.client.patch("/api/v1/profile", headers=headers,
                                              json={"middle_name": ""})
    assert response.status_code == 200
    assert response.json()["middle_name"] is None


async def test_jwt_contains_single_role(api_context: ApiTestContext) -> None:
    _, token = await authenticated_context(api_context)
    settings = get_settings()
    claims = jwt.decode(token, settings.jwt_secret_key.get_secret_value(),
                        algorithms=[settings.jwt_algorithm], audience=settings.jwt_audience,
                        issuer=settings.jwt_issuer)
    assert claims["role"] == "TEACHER"
    assert "roles" not in claims


async def test_disabled_account_cannot_use_access_or_refresh(api_context: ApiTestContext) -> None:
    email, token = await authenticated_context(api_context)
    csrf = cookie_value(api_context, "takt_csrf")
    user = await UserRepository(api_context.session).get_by_email(email)
    assert user is not None
    user.is_active = False
    await api_context.session.commit()
    response = await api_context.client.get(
        "/api/v1/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 403
    assert (await login_user(api_context, email)).status_code == 401
    refresh = await api_context.client.post(
        "/api/v1/auth/refresh", headers={"X-CSRF-Token": csrf}
    )
    assert refresh.status_code == 401
