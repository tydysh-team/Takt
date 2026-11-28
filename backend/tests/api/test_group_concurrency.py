import asyncio
from datetime import timedelta
from types import SimpleNamespace
from uuid import UUID

import pytest
from conftest import require_test_database_url
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from test_group_lessons import actor

from app.core.exceptions import StudentScheduleConflictError
from app.core.security import utc_now
from app.models.enums import RoleCode
from app.models.lesson import Lesson, LessonParticipant
from app.models.teacher_student_relation import TeacherStudentRelation
from app.models.user import User
from app.schemas.lessons import LessonCreate, LessonSeriesCreate
from app.services.lessons import LessonService

pytestmark = [pytest.mark.asyncio, pytest.mark.postgresql]


@pytest.mark.parametrize("series", [False, True])
async def test_different_teachers_overlapping_groups_serialize_without_deadlock(series):
    engine = create_async_engine(require_test_database_url())
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    user_ids: list[UUID] = []
    teacher_ids: list[UUID] = []
    try:
        async with sessions() as session:
            context = SimpleNamespace(session=session)
            teachers = [(await actor(context, RoleCode.TEACHER))[0] for _ in range(2)]
            students = [(await actor(context, RoleCode.STUDENT))[0] for _ in range(3)]
            user_ids = [u.id for u in [*teachers, *students]]
            teacher_ids = [t.id for t in teachers]
            student_ids = [s.id for s in students]
            session.add_all(
                [
                    TeacherStudentRelation(teacher_id=t.id, student_id=s.id, created_at=utc_now())
                    for t in teachers
                    for s in students
                ]
            )
            await session.commit()
        start = utc_now() + timedelta(days=30)
        # Opposite request order and partially overlapping sets; the shared student
        # must serialize even though teacher locks belong to different rows.
        groups = [[student_ids[1], student_ids[0]], [student_ids[2], student_ids[1]]]

        async def write(index):
            async with sessions() as session:
                teacher = await session.get(User, teacher_ids[index])
                fields = dict(
                    student_ids=groups[index],
                    title="Race",
                    starts_at=start,
                    duration_minutes=60,
                    confirm_conflict=True,
                )
                service = LessonService(session)
                try:
                    if series:
                        return await service.create_series(
                            teacher, LessonSeriesCreate(**fields, recurrence="weekly", count=3)
                        )
                    return await service.create(teacher, LessonCreate(**fields))
                except StudentScheduleConflictError as exc:
                    return exc

        results = await asyncio.wait_for(asyncio.gather(write(0), write(1)), timeout=15)
        assert sum(isinstance(r, StudentScheduleConflictError) for r in results) == 1
        async with sessions() as session:
            stored = await session.scalar(
                select(func.count())
                .select_from(Lesson)
                .where(
                    Lesson.participants.any(LessonParticipant.student_id == student_ids[1]),
                )
            )
            assert stored == (3 if series else 1)
    finally:
        if user_ids:
            async with sessions() as session:
                await session.execute(delete(Lesson).where(Lesson.teacher_id.in_(teacher_ids)))
                await session.execute(
                    delete(TeacherStudentRelation).where(
                        TeacherStudentRelation.teacher_id.in_(teacher_ids)
                    )
                )
                await session.execute(delete(User).where(User.id.in_(user_ids)))
                await session.commit()
        await engine.dispose()
