from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app import seed
from app.core.security import utc_now
from app.models.enums import RelationStatus
from app.models.teacher_student_relation import TeacherStudentRelation


@pytest.mark.asyncio
@pytest.mark.parametrize("third_was_linked", [False, True])
async def test_seed_creates_only_two_demo_relations_on_repeated_runs(
    monkeypatch: pytest.MonkeyPatch,
    third_was_linked: bool,
) -> None:
    users = {definition.email: SimpleNamespace(id=uuid4()) for definition in seed.DEMO_USERS}
    teacher_id = users["teacher@demo.example.com"].id
    first_id = users["student1@demo.example.com"].id
    second_id = users["student2@demo.example.com"].id
    third_id = users["student3@demo.example.com"].id
    relations: dict[tuple[object, object], TeacherStudentRelation] = {
        (teacher_id, second_id): TeacherStudentRelation(
            teacher_id=teacher_id,
            student_id=second_id,
            status=RelationStatus.INACTIVE,
            created_at=utc_now(),
            deactivated_at=utc_now(),
        ),
    }
    if third_was_linked:
        relations[(teacher_id, third_id)] = TeacherStudentRelation(
            teacher_id=teacher_id,
            student_id=third_id,
            status=RelationStatus.ACTIVE,
            created_at=utc_now(),
        )
    async def ensure_user(
        _session: object, definition: seed.DemoUser, _passwords: object
    ) -> object:
        return users[definition.email]

    async def get_by_pair(
        teacher: object, student: object, *, for_update: bool = False
    ) -> TeacherStudentRelation | None:
        assert for_update
        return relations.get((teacher, student))

    def add_relation(relation: TeacherStudentRelation) -> None:
        relations[(relation.teacher_id, relation.student_id)] = relation

    session = AsyncMock()
    session.__aenter__.return_value = session
    repository = SimpleNamespace(get_by_pair=get_by_pair, add=add_relation)
    monkeypatch.setattr(seed, "get_settings", lambda: SimpleNamespace(app_env="development"))
    monkeypatch.setattr(seed, "session_factory", lambda: session)
    monkeypatch.setattr(seed, "_ensure_user", ensure_user)
    monkeypatch.setattr(seed, "TeacherStudentRelationRepository", lambda _session: repository)

    for _ in range(2):
        await seed.seed_development()
        assert relations[(teacher_id, first_id)].status == RelationStatus.ACTIVE
        assert relations[(teacher_id, second_id)].status == RelationStatus.ACTIVE
        assert relations[(teacher_id, second_id)].deactivated_at is None
        if third_was_linked:
            assert relations[(teacher_id, third_id)].status == RelationStatus.ACTIVE
            assert relations[(teacher_id, third_id)].deactivated_at is None
        else:
            assert (teacher_id, third_id) not in relations

    assert session.commit.await_count == 2
