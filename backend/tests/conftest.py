import os
from collections.abc import AsyncIterator
from dataclasses import dataclass

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://takt:test-only@localhost:5432/takt_test",
)
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("TRUSTED_HOSTS", '["testserver","localhost"]')
os.environ.setdefault("CORS_ORIGINS", '["http://localhost:5173"]')
os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-key-which-is-longer-than-thirty-two-characters")
os.environ.setdefault(
    "REFRESH_TOKEN_HMAC_KEY",
    "test-refresh-key-which-is-longer-than-thirty-two-characters",
)
os.environ.setdefault(
    "RATE_LIMIT_HMAC_KEY",
    "test-rate-limit-key-which-is-longer-than-thirty-two-characters",
)

import httpx  # noqa: E402
import pytest_asyncio  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.api.dependencies.auth import get_rate_limiter  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.core.rate_limit import InMemoryRateLimiter  # noqa: E402
from app.db.session import get_db_session  # noqa: E402
from app.main import app  # noqa: E402


@dataclass(slots=True)
class ApiTestContext:
    client: httpx.AsyncClient
    session: AsyncSession


@pytest_asyncio.fixture
async def api_context() -> AsyncIterator[ApiTestContext]:
    """Run API tests in a rollback-only transaction on a migrated PostgreSQL database."""
    database_url = get_settings().test_database_url
    if database_url is None:
        raise RuntimeError("TEST_DATABASE_URL must point to a migrated PostgreSQL test database")

    engine = create_async_engine(database_url, pool_pre_ping=True)
    async with engine.connect() as connection:
        outer_transaction = await connection.begin()
        session_factory = async_sessionmaker(
            bind=connection,
            class_=AsyncSession,
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )
        async with session_factory() as session:
            limiter = InMemoryRateLimiter()

            async def override_session() -> AsyncIterator[AsyncSession]:
                yield session

            def override_rate_limiter() -> InMemoryRateLimiter:
                return limiter

            app.dependency_overrides[get_db_session] = override_session
            app.dependency_overrides[get_rate_limiter] = override_rate_limiter
            transport = httpx.ASGITransport(app=app, client=("127.0.0.1", 12345))
            async with httpx.AsyncClient(
                transport=transport,
                base_url="http://testserver",
            ) as client:
                yield ApiTestContext(client=client, session=session)

            app.dependency_overrides.clear()
        if outer_transaction.is_active:
            await outer_transaction.rollback()
    await engine.dispose()

