from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID

import pytest

from app.core.exceptions import StudentNotAvailableError
from app.services.lessons import LessonService


@pytest.mark.asyncio
async def test_every_student_is_locked_in_uuid_order_before_any_relation():
    ids = [UUID(int=3), UUID(int=1), UUID(int=2)]
    session = AsyncMock()
    session.scalars.return_value = SimpleNamespace(all=lambda: ids)
    service = LessonService(session)
    calls = []

    async def lock(student_id):
        calls.append(("student", student_id))

    async def relation(teacher_id, student_id, *, for_update):
        assert teacher_id == UUID(int=9) and for_update
        calls.append(("relation", student_id))
        return object()

    service._lessons.lock_student_schedule = AsyncMock(side_effect=lock)
    service._relations.get_student = AsyncMock(side_effect=relation)
    await service._lock_participants(UUID(int=9), ids)
    assert calls == [(kind, student_id) for kind in ["student", "relation"] for student_id in sorted(ids)]


@pytest.mark.asyncio
async def test_non_student_id_is_rejected_before_taking_any_participant_lock():
    session = AsyncMock()
    session.scalars.return_value = SimpleNamespace(all=lambda: [UUID(int=1)])
    service = LessonService(session)
    service._lessons.lock_student_schedule = AsyncMock()
    with pytest.raises(StudentNotAvailableError):
        await service._lock_participants(UUID(int=9), [UUID(int=1), UUID(int=8)])
    service._lessons.lock_student_schedule.assert_not_awaited()
