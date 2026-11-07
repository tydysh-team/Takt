from datetime import datetime, timedelta
from typing import Protocol
from uuid import uuid4

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import TokenService, utc_now
from app.models.enums import AttendanceValue, RelationStatus, RoleCode
from app.models.lesson import Lesson
from app.models.profile import Profile
from app.models.role_profiles import StudentProfile, TeacherProfile
from app.models.teacher_student_relation import TeacherStudentRelation
from app.models.user import User

pytestmark = [pytest.mark.asyncio, pytest.mark.postgresql]


class ApiTestContext(Protocol):
    client: httpx.AsyncClient
    session: AsyncSession


async def actor(context: ApiTestContext, role: RoleCode) -> tuple[User, str]:
    user = User(
        email=f"schedule-{uuid4().hex}@example.com",
        password_hash="test-only",
        role=role,
        is_active=True,
    )
    user.profile = Profile(
        first_name=role.value.title(), last_name="Schedule", timezone="Europe/Moscow",
    )
    if role == RoleCode.TEACHER:
        user.teacher_profile = TeacherProfile()
    else:
        user.student_profile = StudentProfile()
    context.session.add(user)
    await context.session.commit()
    token = TokenService(get_settings()).create_access_token(user_id=user.id, role=role).value
    return user, token


async def connect(
    context: ApiTestContext, teacher: User, student: User,
    status: RelationStatus = RelationStatus.ACTIVE,
) -> None:
    context.session.add(TeacherStudentRelation(
        teacher_id=teacher.id, student_id=student.id, created_at=utc_now(), status=status,
        deactivated_at=utc_now() if status == RelationStatus.INACTIVE else None,
    ))
    await context.session.commit()


def headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def window(start: datetime) -> dict[str, str]:
    return {
        "date_from": (start - timedelta(hours=1)).isoformat(),
        "date_to": (start + timedelta(days=7)).isoformat(),
    }


async def test_teacher_and_student_see_shared_lessons_and_private_busy_intervals(
    api_context: ApiTestContext,
) -> None:
    teacher, teacher_token = await actor(api_context, RoleCode.TEACHER)
    other_teacher, _ = await actor(api_context, RoleCode.TEACHER)
    student, student_token = await actor(api_context, RoleCode.STUDENT)
    other_student, _ = await actor(api_context, RoleCode.STUDENT)
    await connect(api_context, teacher, student)
    await connect(api_context, other_teacher, student)
    await connect(api_context, teacher, other_student)
    start = utc_now() + timedelta(days=28)
    shared = Lesson(
        teacher_id=teacher.id, student_id=student.id, title="Shared lesson",
        description="Shared description", starts_at=start, duration_minutes=60,
    )
    foreign_student = Lesson(
        teacher_id=other_teacher.id, student_id=student.id, title="Private foreign title",
        description="Private foreign notes", starts_at=start + timedelta(minutes=30),
        duration_minutes=60, attendance=AttendanceValue.PRESENT,
        attendance_updated_at=utc_now(),
    )
    foreign_teacher = Lesson(
        teacher_id=teacher.id, student_id=other_student.id, title="Other student's title",
        description="Other student's notes", starts_at=start + timedelta(minutes=15),
        duration_minutes=60,
    )
    api_context.session.add_all([shared, foreign_student, foreign_teacher])
    await api_context.session.commit()

    for person_id, token, foreign in (
        (student.id, teacher_token, foreign_student),
        (teacher.id, student_token, foreign_teacher),
    ):
        response = await api_context.client.post(
            f"/api/v1/lessons/people/{person_id}/schedule",
            headers=headers(token), json=window(start),
        )
        assert response.status_code == 200
        items = response.json()
        assert [item["type"] for item in items] == ["lesson", "busy"]
        own = items[0]
        assert own["id"] == str(shared.id)
        assert own["title"] == "Shared lesson"
        assert own["description"] == "Shared description"
        busy = items[1]
        assert set(busy) == {"type", "starts_at", "ends_at"}
        assert datetime.fromisoformat(busy["starts_at"]) == foreign.starts_at
        assert datetime.fromisoformat(busy["ends_at"]) == foreign.starts_at + timedelta(hours=1)
        assert str(foreign.id) not in response.text
        third_party_id = foreign.teacher_id if foreign is foreign_student else foreign.student_id
        assert str(third_party_id) not in response.text
        assert foreign.title not in response.text
        assert foreign.description not in response.text


async def test_schedule_requires_active_connection_and_rejects_id_substitution(
    api_context: ApiTestContext,
) -> None:
    teacher, teacher_token = await actor(api_context, RoleCode.TEACHER)
    student, student_token = await actor(api_context, RoleCode.STUDENT)
    stranger, _ = await actor(api_context, RoleCode.STUDENT)
    inactive_teacher, inactive_token = await actor(api_context, RoleCode.TEACHER)
    await connect(api_context, teacher, student)
    await connect(api_context, inactive_teacher, student, RelationStatus.INACTIVE)
    start = utc_now() + timedelta(days=14)
    for person_id, token in (
        (stranger.id, teacher_token),
        (inactive_teacher.id, student_token),
        (student.id, inactive_token),
        (uuid4(), teacher_token),
        (uuid4(), student_token),
    ):
        response = await api_context.client.post(
            f"/api/v1/lessons/people/{person_id}/schedule",
            headers=headers(token), json=window(start),
        )
        assert response.status_code == 404


async def test_busy_excludes_cancelled_and_past_but_shared_history_remains(
    api_context: ApiTestContext,
) -> None:
    teacher, teacher_token = await actor(api_context, RoleCode.TEACHER)
    other_teacher, _ = await actor(api_context, RoleCode.TEACHER)
    student, _ = await actor(api_context, RoleCode.STUDENT)
    await connect(api_context, teacher, student)
    start = utc_now() - timedelta(days=2)
    api_context.session.add_all([
        Lesson(
            teacher_id=teacher.id, student_id=student.id, title="Shared past",
            starts_at=start, duration_minutes=60,
        ),
        Lesson(
            teacher_id=other_teacher.id, student_id=student.id, title="Foreign past",
            starts_at=start, duration_minutes=60,
        ),
        Lesson(
            teacher_id=other_teacher.id, student_id=student.id, title="Foreign cancelled",
            starts_at=utc_now() + timedelta(hours=1), duration_minutes=60,
            cancelled_at=utc_now(),
        ),
    ])
    await api_context.session.commit()
    response = await api_context.client.post(
        f"/api/v1/lessons/people/{student.id}/schedule",
        headers=headers(teacher_token), json=window(start),
    )
    assert response.status_code == 200
    assert [item["type"] for item in response.json()] == ["lesson"]
    assert response.json()[0]["title"] == "Shared past"


async def test_busy_week_boundaries_and_overlaps_are_preserved(
    api_context: ApiTestContext,
) -> None:
    teacher, token = await actor(api_context, RoleCode.TEACHER)
    other_teacher, _ = await actor(api_context, RoleCode.TEACHER)
    student, _ = await actor(api_context, RoleCode.STUDENT)
    await connect(api_context, teacher, student)
    start = utc_now() + timedelta(days=21)
    api_context.session.add_all([
        Lesson(
            teacher_id=other_teacher.id, student_id=student.id, title=f"Foreign {index}",
            starts_at=start + timedelta(minutes=offset), duration_minutes=60,
        )
        for index, offset in enumerate((0, 30, 90))
    ])
    await api_context.session.commit()
    response = await api_context.client.post(
        f"/api/v1/lessons/people/{student.id}/schedule",
        headers=headers(token), json={
            "date_from": start.isoformat(),
            "date_to": (start + timedelta(minutes=90)).isoformat(),
        },
    )
    assert response.status_code == 200
    assert [item["type"] for item in response.json()] == ["busy", "busy"]
    assert [datetime.fromisoformat(item["starts_at"]) for item in response.json()] == [
        start, start + timedelta(minutes=30),
    ]
