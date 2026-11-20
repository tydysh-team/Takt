from datetime import UTC, datetime, timedelta, timezone
from typing import Protocol
from uuid import UUID, uuid4

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import TokenService
from app.main import app
from app.models.enums import RelationStatus, RoleCode
from app.models.homework import (
    Homework,
    HomeworkReview,
    HomeworkStatus,
    HomeworkSubmission,
    ReviewDecision,
)
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
        email=f"statistics-{uuid4().hex}@example.com",
        password_hash="test-only",
        role=role,
        is_active=True,
    )
    user.profile = Profile(first_name="Statistics", last_name="Test", timezone="Europe/Moscow")
    if role == RoleCode.TEACHER:
        user.teacher_profile = TeacherProfile()
    elif role == RoleCode.STUDENT:
        user.student_profile = StudentProfile()
    context.session.add(user)
    await context.session.commit()
    token = TokenService(get_settings()).create_access_token(user_id=user.id, role=role).value
    return user, token


async def connect(context: ApiTestContext, teacher: User, student: User) -> None:
    context.session.add(
        TeacherStudentRelation(
            teacher_id=teacher.id,
            student_id=student.id,
            created_at=datetime.now(UTC),
            status=RelationStatus.ACTIVE,
        )
    )
    await context.session.commit()


def path(student_id: UUID) -> str:
    return f"/api/v1/teachers/me/students/{student_id}/homework-statistics"


def period(start: datetime, end: datetime) -> dict[str, str]:
    return {"date_from": start.isoformat(), "date_to": end.isoformat()}


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def homework(
    teacher: User, student: User, created_at: datetime, due_at: datetime
) -> Homework:
    return Homework(
        id=uuid4(),
        teacher_id=teacher.id,
        student_id=student.id,
        title="Read chapter",
        due_at=due_at,
        created_at=created_at,
        status=HomeworkStatus.ASSIGNED,
        idempotency_key=uuid4(),
        request_fingerprint="0" * 64,
    )


def submission(
    task: Homework, attempt: int, submitted_at: datetime, decision: ReviewDecision | None
) -> tuple[HomeworkSubmission, HomeworkReview | None]:
    item = HomeworkSubmission(
        id=uuid4(),
        homework_id=task.id,
        attempt_no=attempt,
        submitted_at=submitted_at,
        is_late=submitted_at > task.due_at,
        idempotency_key=uuid4(),
        request_fingerprint="0" * 64,
    )
    review = (
        HomeworkReview(
            id=uuid4(),
            submission_id=item.id,
            decision=decision,
            reviewed_at=submitted_at + timedelta(hours=1),
        )
        if decision is not None
        else None
    )
    return item, review


async def test_counts_history_cohort_boundaries_and_rounding(api_context: ApiTestContext) -> None:
    teacher, token = await actor(api_context, RoleCode.TEACHER)
    other_teacher, _ = await actor(api_context, RoleCode.TEACHER)
    student, _ = await actor(api_context, RoleCode.STUDENT)
    other_student, _ = await actor(api_context, RoleCode.STUDENT)
    await connect(api_context, teacher, student)
    start = datetime(2030, 1, 1, tzinfo=UTC)
    end = start + timedelta(days=7)
    due = start + timedelta(days=2)

    untouched = homework(teacher, student, start, due)
    pending = homework(teacher, student, start + timedelta(days=1), due)
    revised = homework(teacher, student, start + timedelta(days=2), due)
    pending.status = HomeworkStatus.SUBMITTED
    revised.status = HomeworkStatus.REVIEWED
    excluded = homework(teacher, student, end, due)
    foreign_teacher = homework(other_teacher, student, start, due)
    foreign_student = homework(teacher, other_student, start, due)
    attempts = [
        submission(pending, 1, due - timedelta(seconds=1), ReviewDecision.NEEDS_REVISION),
        submission(pending, 2, due, None),
        submission(revised, 1, due + timedelta(seconds=1), ReviewDecision.NEEDS_REVISION),
        submission(revised, 2, end + timedelta(days=1), ReviewDecision.NEEDS_REVISION),
        submission(revised, 3, end + timedelta(days=2), ReviewDecision.ACCEPTED),
        submission(excluded, 1, due + timedelta(days=1), ReviewDecision.ACCEPTED),
        submission(foreign_teacher, 1, due + timedelta(days=1), ReviewDecision.ACCEPTED),
        submission(foreign_student, 1, due + timedelta(days=1), ReviewDecision.ACCEPTED),
    ]
    api_context.session.add_all(
        [untouched, pending, revised, excluded, foreign_teacher, foreign_student]
        + [record for pair in attempts for record in pair if record is not None]
    )
    await api_context.session.commit()

    response = await api_context.client.get(
        path(student.id), params=period(start, end), headers=auth(token)
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["student_id"] == str(student.id)
    assert datetime.fromisoformat(body["date_from"]) == start
    assert datetime.fromisoformat(body["date_to"]) == end
    assert body["statistics"] == {
        "assigned": 3,
        "submitted": 2,
        "reviewed": 1,
        "late": 1,
        "revision_required": 2,
        "completion_rate": 33.33,
    }
    source = await api_context.client.get(
        "/api/v1/homework", params={"student_id": str(student.id)}, headers=auth(token)
    )
    assert source.status_code == 200
    source_cohort = {
        item["id"]
        for item in source.json()["items"]
        if start <= datetime.fromisoformat(item["created_at"]) < end
    }
    assert source_cohort == {str(untouched.id), str(pending.id), str(revised.id)}
    assert len(source_cohort) == body["statistics"]["assigned"]
    # The previous revision remains visible after acceptance, and late retries count once.
    assert revised.status == HomeworkStatus.REVIEWED


async def test_empty_period_and_one_assigned_without_submission(
    api_context: ApiTestContext,
) -> None:
    teacher, token = await actor(api_context, RoleCode.TEACHER)
    student, _ = await actor(api_context, RoleCode.STUDENT)
    await connect(api_context, teacher, student)
    start = datetime(2030, 1, 1, tzinfo=UTC)
    end = start + timedelta(days=1)
    empty = await api_context.client.get(
        path(student.id), params=period(start, end), headers=auth(token)
    )
    assert empty.status_code == 200
    assert empty.json()["statistics"] == {
        "assigned": 0,
        "submitted": 0,
        "reviewed": 0,
        "late": 0,
        "revision_required": 0,
        "completion_rate": None,
    }
    api_context.session.add(homework(teacher, student, start, end))
    await api_context.session.commit()
    one = await api_context.client.get(
        path(student.id), params=period(start, end), headers=auth(token)
    )
    assert one.status_code == 200
    assert one.json()["statistics"]["assigned"] == 1
    assert one.json()["statistics"]["completion_rate"] == 0.0


async def test_authorization_and_period_validation(api_context: ApiTestContext) -> None:
    teacher, token = await actor(api_context, RoleCode.TEACHER)
    other_teacher, other_token = await actor(api_context, RoleCode.TEACHER)
    student, student_token = await actor(api_context, RoleCode.STUDENT)
    _, admin_token = await actor(api_context, RoleCode.ADMIN)
    await connect(api_context, teacher, student)
    start = datetime(2030, 1, 1, tzinfo=UTC)
    end = start + timedelta(days=1)
    request_path = path(student.id)
    valid = period(start, end)
    assert (await api_context.client.get(request_path, params=valid)).status_code == 401
    for denied_token, expected in ((student_token, 403), (admin_token, 403), (other_token, 404)):
        denied = await api_context.client.get(
            request_path, params=valid, headers=auth(denied_token)
        )
        assert denied.status_code == expected
    missing = await api_context.client.get(path(uuid4()), params=valid, headers=auth(token))
    assert missing.status_code == 404
    assert other_teacher.id != teacher.id
    invalid = [
        period(end, start),
        period(start, start),
        {"date_from": "2030-01-01T00:00:00", "date_to": end.isoformat()},
        {"date_from": start.isoformat()},
    ]
    for params in invalid:
        response = await api_context.client.get(request_path, params=params, headers=auth(token))
        assert response.status_code == 422, response.text
        assert response.json()["error"]["code"] == "validation_error"
    assert (await api_context.client.get(
        "/api/v1/teachers/me/students/not-a-uuid/homework-statistics",
        params=valid, headers=auth(token),
    )).status_code == 422
    relation = await api_context.session.scalar(
        select(TeacherStudentRelation).where(
            TeacherStudentRelation.teacher_id == teacher.id,
            TeacherStudentRelation.student_id == student.id,
        )
    )
    assert relation is not None
    relation.status = RelationStatus.INACTIVE
    relation.deactivated_at = datetime.now(UTC)
    await api_context.session.commit()
    inactive = await api_context.client.get(request_path, params=valid, headers=auth(token))
    assert inactive.status_code == 404


async def test_timezone_offset_selects_same_instant(api_context: ApiTestContext) -> None:
    teacher, token = await actor(api_context, RoleCode.TEACHER)
    student, _ = await actor(api_context, RoleCode.STUDENT)
    await connect(api_context, teacher, student)
    start = datetime(2030, 1, 1, 0, tzinfo=UTC)
    api_context.session.add(homework(teacher, student, start, start + timedelta(days=1)))
    await api_context.session.commit()
    offset = timezone(timedelta(hours=4))
    response = await api_context.client.get(
        path(student.id),
        params=period(start.astimezone(offset), (start + timedelta(hours=1)).astimezone(offset)),
        headers=auth(token),
    )
    assert response.status_code == 200
    assert response.json()["statistics"]["assigned"] == 1


async def test_database_failure_does_not_return_empty_statistics(
    api_context: ApiTestContext, monkeypatch: pytest.MonkeyPatch
) -> None:
    teacher, token = await actor(api_context, RoleCode.TEACHER)
    student, _ = await actor(api_context, RoleCode.STUDENT)
    await connect(api_context, teacher, student)

    async def fail(*_args: object) -> None:
        raise SQLAlchemyError("test database failure")

    monkeypatch.setattr(
        "app.repositories.homework_statistics.HomeworkStatisticsRepository.count_for_student", fail
    )
    start = datetime(2030, 1, 1, tzinfo=UTC)
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(
            path(student.id), params=period(start, start + timedelta(days=1)), headers=auth(token)
        )
    assert response.status_code == 500
    assert "statistics" not in response.json()


async def test_openapi_contract() -> None:
    endpoint = app.openapi()["paths"][
        "/api/v1/teachers/me/students/{student_id}/homework-statistics"
    ]["get"]
    assert endpoint["responses"]["200"]["content"]["application/json"]["schema"]["$ref"].endswith(
        "HomeworkStatisticsResponse"
    )
    assert {parameter["name"] for parameter in endpoint["parameters"]} == {
        "student_id", "date_from", "date_to"
    }
