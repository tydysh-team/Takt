import asyncio
import hashlib
import hmac
import secrets
from collections.abc import AsyncIterator
from uuid import uuid4

import httpx
import pyotp
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import delete, select
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.security import PasswordService, utc_now
from app.db.session import get_db_session
from app.main import app
from app.models.enums import RoleCode
from app.models.mfa import MfaBackupCode, UserTotp
from app.models.profile import Profile
from app.models.user import User

pytestmark = [pytest.mark.asyncio, pytest.mark.postgresql]


async def test_concurrent_verification_can_consume_backup_code_only_once() -> None:
    settings = get_settings()
    assert make_url(settings.database_url).database == "takt_test"
    database_url = settings.test_database_url
    assert database_url is not None
    assert make_url(database_url).database == "takt_test"
    assert settings.totp_encryption_key is not None
    assert settings.mfa_backup_hmac_key is not None

    user_id = uuid4()
    password = "StrongPass!123"
    backup_code = secrets.token_hex(12).upper()
    secret = pyotp.random_base32()
    encrypted = Fernet(settings.totp_encryption_key.get_secret_value().encode()).encrypt(
        secret.encode()
    ).decode()
    digest = hmac.new(
        settings.mfa_backup_hmac_key.get_secret_value().encode(),
        b"backup:" + user_id.bytes + backup_code.encode(),
        hashlib.sha256,
    ).hexdigest()
    user = User(
        id=user_id,
        email=f"mfa-concurrency-{user_id.hex}@example.com",
        password_hash=PasswordService().hash(password),
        role=RoleCode.TEACHER,
        is_active=True,
    )
    user.profile = Profile(first_name="Ada", last_name="Example", timezone="Europe/Moscow")
    engine = create_async_engine(database_url, pool_pre_ping=True)
    sessions = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)

    async def override_session() -> AsyncIterator[AsyncSession]:
        async with sessions() as session:
            yield session

    try:
        async with sessions() as session:
            session.add(user)
            await session.flush()
            session.add(UserTotp(
                user_id=user_id, encrypted_secret=encrypted, enabled_at=utc_now()
            ))
            session.add(MfaBackupCode(user_id=user_id, code_digest=digest))
            await session.commit()

        app.dependency_overrides[get_db_session] = override_session
        transport_one = httpx.ASGITransport(app=app, client=("127.0.0.1", 30001))
        transport_two = httpx.ASGITransport(app=app, client=("127.0.0.1", 30002))
        async with (
            httpx.AsyncClient(transport=transport_one, base_url="http://testserver") as first,
            httpx.AsyncClient(transport=transport_two, base_url="http://testserver") as second,
        ):
            login_body = {"email": user.email, "password": password}
            first_login = await first.post("/api/v1/auth/login", json=login_body)
            second_login = await second.post("/api/v1/auth/login", json=login_body)
            assert first_login.status_code == second_login.status_code == 200
            responses = await asyncio.gather(
                first.post("/api/v1/auth/mfa/verify", json={
                    "challenge": first_login.json()["challenge"], "code": backup_code,
                }),
                second.post("/api/v1/auth/mfa/verify", json={
                    "challenge": second_login.json()["challenge"], "code": backup_code,
                }),
            )
            assert sorted(response.status_code for response in responses) == [200, 400]
            assert sum("access_token" in response.json() for response in responses) == 1
        async with sessions() as session:
            backup = await session.scalar(
                select(MfaBackupCode).where(MfaBackupCode.user_id == user_id)
            )
            assert backup is not None and backup.consumed_at is not None
    finally:
        app.dependency_overrides.pop(get_db_session, None)
        try:
            async with sessions() as session:
                await session.execute(delete(User).where(User.id == user_id))
                await session.commit()
        finally:
            await engine.dispose()
