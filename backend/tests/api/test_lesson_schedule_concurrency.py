import asyncio
from collections.abc import AsyncIterator
from datetime import timedelta
from uuid import UUID, uuid4

import httpx
import pytest
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.security import TokenService, utc_now
from app.db.session import get_db_session
from app.main import app
from app.models.enums import RoleCode
from app.models.lesson import Lesson
from app.models.profile import Profile
from app.models.role_profiles import StudentProfile, TeacherProfile
from app.models.teacher_student_relation import TeacherStudentRelation
from app.models.user import User

pytestmark = [pytest.mark.asyncio, pytest.mark.postgresql]


async def test_concurrent_creates_require_confirmation_for_the_second_lesson() -> None:
    database_url = get_settings().test_database_url
    if database_url is None:
        raise RuntimeError("TEST_DATABASE_URL must point to a migrated PostgreSQL test database")

    engine = create_async_engine(database_url, pool_pre_ping=True)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    teacher_id = None
    student_id = None
    try:
        async with sessions() as setup:
            teacher = User(
                email=f"concurrent-teacher-{uuid4().hex}@example.com",
                password_hash="test-only",
                role=RoleCode.TEACHER,
                is_active=True,
            )
            teacher.profile = Profile(
                first_name="Teacher", last_name="Concurrent", timezone="Europe/Moscow"
            )
            teacher.teacher_profile = TeacherProfile()
            student = User(
                email=f"concurrent-student-{uuid4().hex}@example.com",
                password_hash="test-only",
                role=RoleCode.STUDENT,
                is_active=True,
            )
            student.profile = Profile(
                first_name="Student", last_name="Concurrent", timezone="Europe/Moscow"
            )
            student.student_profile = StudentProfile()
            setup.add_all([teacher, student])
            await setup.flush()
            teacher_id = teacher.id
            student_id = student.id
            setup.add(
                TeacherStudentRelation(
                    teacher_id=teacher_id,
                    student_id=student_id,
                    created_at=utc_now(),
                )
            )
            await setup.commit()

        token = (
            TokenService(get_settings())
            .create_access_token(user_id=teacher_id, role=RoleCode.TEACHER)
            .value
        )
        start = utc_now() + timedelta(days=30)
        body = {
            "student_id": str(student_id),
            "title": "Parallel lesson",
            "starts_at": start.isoformat(),
            "duration_minutes": 60,
        }

        async def override_session() -> AsyncIterator[AsyncSession]:
            async with sessions() as session:
                yield session

        app.dependency_overrides[get_db_session] = override_session
        try:
            transport = httpx.ASGITransport(app=app, client=("127.0.0.1", 12345))
            async with httpx.AsyncClient(
                transport=transport,
                base_url="http://testserver",
            ) as client:

                async def create() -> httpx.Response:
                    return await client.post(
                        "/api/v1/lessons",
                        headers={"Authorization": f"Bearer {token}"},
                        json=body,
                    )

                first, second = await asyncio.gather(create(), create())

            assert sorted([first.status_code, second.status_code]) == [201, 409]
            warning = first if first.status_code == 409 else second
            assert warning.json()["error"]["code"] == "lesson_time_conflict"
            assert len(warning.json()["error"]["context"]["conflicts"]) == 1

            created = first if first.status_code == 201 else second
            cancel_path = f"/api/v1/lessons/{created.json()['id']}/cancel"
            cancel_transport = httpx.ASGITransport(app=app, client=("127.0.0.1", 12345))
            async with httpx.AsyncClient(
                transport=cancel_transport,
                base_url="http://testserver",
            ) as cancel_client:

                async def cancel(reason: str) -> httpx.Response:
                    return await cancel_client.post(
                        cancel_path,
                        headers={"Authorization": f"Bearer {token}"},
                        json={"reason": reason},
                    )

                cancelled, repeated = await asyncio.gather(cancel("First"), cancel("Second"))
            assert cancelled.status_code == repeated.status_code == 200
            assert cancelled.json()["cancellation_reason"] == repeated.json()[
                "cancellation_reason"
            ]
            assert cancelled.json()["cancellation_reason"] in {"First", "Second"}

            async with sessions() as verify:
                lesson = await verify.get(Lesson, UUID(created.json()["id"]))
                assert lesson is not None
                assert lesson.cancelled_at is not None
                assert lesson.cancellation_reason == cancelled.json()["cancellation_reason"]
        finally:
            app.dependency_overrides.pop(get_db_session, None)
    finally:
        if teacher_id is not None and student_id is not None:
            async with sessions() as cleanup:
                await cleanup.execute(delete(Lesson).where(Lesson.teacher_id == teacher_id))
                await cleanup.execute(
                    delete(TeacherStudentRelation).where(
                        TeacherStudentRelation.teacher_id == teacher_id
                    )
                )
                await cleanup.execute(delete(User).where(User.id.in_([teacher_id, student_id])))
                await cleanup.commit()
        await engine.dispose()
