from datetime import UTC, datetime, timedelta, timezone
from decimal import Decimal
from typing import Protocol
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import event, select
from sqlalchemy.engine import Connection
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import TokenService
from app.main import app
from app.models.enums import AttendanceValue, RelationStatus, RoleCode
from app.models.homework import (
    Homework,
    HomeworkReview,
    HomeworkStatus,
    HomeworkSubmission,
    ReviewDecision,
)
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
        email=f"progress-{uuid4().hex}@example.com",
        password_hash="test-only",
        role=role,
        is_active=True,
    )
    user.profile = Profile(first_name="Progress", last_name="Test", timezone="Europe/Moscow")
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
            status=RelationStatus.ACTIVE,
            created_at=datetime.now(UTC),
            teacher_note="private teacher note",
        )
    )
    await context.session.commit()


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def period(start: datetime, end: datetime) -> dict[str, str]:
    return {"date_from": start.isoformat(), "date_to": end.isoformat()}


def teacher_path(student: User) -> str:
    return f"/api/v1/teachers/me/students/{student.id}/progress"


STUDENT_PATH = "/api/v1/students/me/progress"


def lesson(
    teacher: User, student: User, starts_at: datetime,
    *, attendance: AttendanceValue | None = None, cancelled: bool = False,
) -> Lesson:
    return Lesson(
        id=uuid4(),
        teacher_id=teacher.id,
        student_id=student.id,
        title="Progress lesson",
        starts_at=starts_at,
        duration_minutes=60,
        attendance=attendance,
        attendance_updated_at=starts_at + timedelta(hours=1) if attendance else None,
        cancelled_at=starts_at if cancelled else None,
    )


def homework(teacher: User, student: User, created_at: datetime, due_at: datetime) -> Homework:
    return Homework(
        id=uuid4(),
        teacher_id=teacher.id,
        student_id=student.id,
        title="Progress homework",
        created_at=created_at,
        due_at=due_at,
        status=HomeworkStatus.ASSIGNED,
        idempotency_key=uuid4(),
        request_fingerprint="0" * 64,
    )


def attempt(
    task: Homework, number: int, submitted_at: datetime,
    decision: ReviewDecision | None = None, grade: Decimal | None = None,
) -> tuple[HomeworkSubmission, HomeworkReview | None]:
    submission = HomeworkSubmission(
        id=uuid4(),
        homework_id=task.id,
        attempt_no=number,
        submitted_at=submitted_at,
        is_late=submitted_at > task.due_at,
        idempotency_key=uuid4(),
        request_fingerprint="0" * 64,
    )
    review = (
        HomeworkReview(
            id=uuid4(),
            submission_id=submission.id,
            decision=decision,
            grade=grade,
            reviewed_at=submitted_at + timedelta(hours=1),
            comment="Revise" if decision == ReviewDecision.NEEDS_REVISION else None,
        )
        if decision is not None else None
    )
    return submission, review


async def test_teacher_summary_matches_us18_us19_and_final_grades(
    api_context: ApiTestContext,
) -> None:
    teacher, teacher_token = await actor(api_context, RoleCode.TEACHER)
    student, student_token = await actor(api_context, RoleCode.STUDENT)
    other_student, _ = await actor(api_context, RoleCode.STUDENT)
    await connect(api_context, teacher, student)
    start = datetime(2020, 1, 1, tzinfo=UTC)
    end = start + timedelta(days=7)
    due = start + timedelta(days=2)
    api_context.session.add_all([
        lesson(teacher, student, start, attendance=AttendanceValue.PRESENT),
        lesson(teacher, student, start + timedelta(days=1), attendance=AttendanceValue.ABSENT),
        lesson(teacher, student, start + timedelta(days=2)),
        lesson(teacher, student, start + timedelta(days=3), cancelled=True),
        lesson(teacher, student, end, attendance=AttendanceValue.PRESENT),
        lesson(teacher, other_student, start, attendance=AttendanceValue.PRESENT),
    ])
    revised = homework(teacher, student, start, due)
    ungraded = homework(teacher, student, start + timedelta(days=1), due)
    unsubmitted = homework(teacher, student, start + timedelta(days=2), due)
    outside = homework(teacher, student, end, due)
    foreign = homework(teacher, other_student, start, due)
    revised.status = HomeworkStatus.REVIEWED
    ungraded.status = HomeworkStatus.REVIEWED
    attempts = [
        attempt(revised, 1, due + timedelta(seconds=1), ReviewDecision.NEEDS_REVISION),
        attempt(revised, 2, end + timedelta(days=1), ReviewDecision.ACCEPTED, Decimal("80")),
        attempt(ungraded, 1, due, ReviewDecision.ACCEPTED),
        attempt(outside, 1, due + timedelta(days=1), ReviewDecision.ACCEPTED, Decimal("100")),
        attempt(foreign, 1, due + timedelta(days=1), ReviewDecision.ACCEPTED, Decimal("100")),
    ]
    api_context.session.add_all(
        [revised, ungraded, unsubmitted, outside, foreign]
        + [record for pair in attempts for record in pair if record is not None]
    )
    await api_context.session.commit()
    params = period(start, end)
    statements = 0

    def count_statement(
        _connection: Connection, _cursor: object, _statement: str,
        _parameters: object, _context: object, _executemany: bool,
    ) -> None:
        nonlocal statements
        statements += 1

    bind = api_context.session.sync_session.get_bind()
    event.listen(bind, "before_cursor_execute", count_statement)
    try:
        summary = await api_context.client.get(
            teacher_path(student), params=params, headers=auth(teacher_token)
        )
    finally:
        event.remove(bind, "before_cursor_execute", count_statement)
    # US-18 history needs at most five queries including authentication;
    # homework and final grades add one aggregate query each.
    assert statements <= 7
    history = await api_context.client.get(
        f"/api/v1/teachers/me/students/{student.id}/lesson-history",
        params=params, headers=auth(teacher_token),
    )
    homework_stats = await api_context.client.get(
        f"/api/v1/teachers/me/students/{student.id}/homework-statistics",
        params=params, headers=auth(teacher_token),
    )
    own = await api_context.client.get(STUDENT_PATH, params=params, headers=auth(student_token))
    assert all(response.status_code == 200 for response in (summary, history, homework_stats, own))
    body = summary.json()
    assert set(body) == {"student_id", "date_from", "date_to", "attendance", "homework", "reviews"}
    assert body["attendance"] == history.json()["aggregates"]
    assert body["homework"] == homework_stats.json()["statistics"]
    assert body["attendance"] == {
        "total_lessons": 4, "completed_lessons": 3, "attended_lessons": 1,
        "missed_lessons": 1, "unmarked_lessons": 1, "cancelled_lessons": 1,
        "attendance_rate": 50.0,
    }
    assert body["homework"] == {
        "assigned": 3, "submitted": 2, "reviewed": 2, "late": 1,
        "revision_required": 1, "completion_rate": 66.67,
    }
    assert body["reviews"] == {"graded_homework": 1, "average_grade": 80.0}
    assert own.json() == body
    assert "private teacher note" not in own.text
    assert str(other_student.id) not in own.text
    review_history = await api_context.client.get(
        f"/api/v1/students/me/homework/{revised.id}/submissions",
        headers=auth(student_token),
    )
    assert review_history.status_code == 200
    assert [item["review"]["decision"] for item in review_history.json()] == [
        "needs_revision", "accepted"
    ]
    assert review_history.json()[-1]["review"]["grade"] == 80


async def test_student_multiple_teachers_weighted_rates_and_historical_data(
    api_context: ApiTestContext,
) -> None:
    first, first_token = await actor(api_context, RoleCode.TEACHER)
    second, second_token = await actor(api_context, RoleCode.TEACHER)
    student, student_token = await actor(api_context, RoleCode.STUDENT)
    other_student, _ = await actor(api_context, RoleCode.STUDENT)
    await connect(api_context, first, student)
    await connect(api_context, second, student)
    await connect(api_context, second, other_student)
    start = datetime(2020, 2, 1, tzinfo=UTC)
    end = start + timedelta(days=7)
    due = start + timedelta(days=2)
    api_context.session.add_all([
        lesson(first, student, start, attendance=AttendanceValue.PRESENT),
        lesson(second, student, start + timedelta(days=1), attendance=AttendanceValue.ABSENT),
        lesson(second, student, start + timedelta(days=2), attendance=AttendanceValue.ABSENT),
        lesson(second, other_student, start, attendance=AttendanceValue.PRESENT),
    ])
    first_task = homework(first, student, start, due)
    second_task = homework(second, student, start, due)
    second_unsubmitted = homework(second, student, start + timedelta(days=1), due)
    foreign = homework(second, other_student, start, due)
    first_task.status = HomeworkStatus.REVIEWED
    second_task.status = HomeworkStatus.REVIEWED
    attempts = [
        attempt(first_task, 1, due, ReviewDecision.ACCEPTED, Decimal("100")),
        attempt(second_task, 1, due, ReviewDecision.ACCEPTED, Decimal("0")),
        attempt(foreign, 1, due, ReviewDecision.ACCEPTED, Decimal("100")),
    ]
    api_context.session.add_all(
        [first_task, second_task, second_unsubmitted, foreign]
        + [record for pair in attempts for record in pair if record is not None]
    )
    await api_context.session.commit()
    params = period(start, end)
    teacher_one = await api_context.client.get(
        teacher_path(student), params=params, headers=auth(first_token)
    )
    teacher_two = await api_context.client.get(
        teacher_path(student), params=params, headers=auth(second_token)
    )
    own = await api_context.client.get(STUDENT_PATH, params=params, headers=auth(student_token))
    assert all(response.status_code == 200 for response in (teacher_one, teacher_two, own))
    first_body, second_body, own_body = teacher_one.json(), teacher_two.json(), own.json()
    assert first_body["attendance"]["attendance_rate"] == 100.0
    assert second_body["attendance"]["attendance_rate"] == 0.0
    assert own_body["attendance"]["attended_lessons"] == 1
    assert own_body["attendance"]["missed_lessons"] == 2
    assert own_body["attendance"]["attendance_rate"] == 33.33
    assert own_body["homework"]["assigned"] == 3
    assert own_body["homework"]["reviewed"] == 2
    assert own_body["homework"]["completion_rate"] == 66.67
    assert own_body["reviews"] == {"graded_homework": 2, "average_grade": 50.0}
    assert str(other_student.id) not in own.text
    source_homework = await api_context.client.get(
        "/api/v1/students/me/homework", headers=auth(student_token)
    )
    assert source_homework.status_code == 200
    assert {item["teacher_id"] for item in source_homework.json()["items"]} == {
        str(first.id), str(second.id)
    }
    source_lessons = await api_context.client.post(
        "/api/v1/lessons/search", json=params, headers=auth(student_token)
    )
    assert source_lessons.status_code == 200
    assert len(source_lessons.json()) == own_body["attendance"]["total_lessons"]
    assert {item["teacher"]["id"] for item in source_lessons.json()} == {
        str(first.id), str(second.id)
    }

    relation = await api_context.session.scalar(
        select(TeacherStudentRelation).where(
            TeacherStudentRelation.teacher_id == second.id,
            TeacherStudentRelation.student_id == student.id,
        )
    )
    assert relation is not None
    relation.status = RelationStatus.INACTIVE
    relation.deactivated_at = datetime.now(UTC)
    await api_context.session.commit()
    denied = await api_context.client.get(
        teacher_path(student), params=params, headers=auth(second_token)
    )
    still_own = await api_context.client.get(
        STUDENT_PATH, params=params, headers=auth(student_token)
    )
    assert denied.status_code == 404
    assert still_own.status_code == 200
    assert still_own.json() == own_body


async def test_empty_and_partial_data(api_context: ApiTestContext) -> None:
    teacher, teacher_token = await actor(api_context, RoleCode.TEACHER)
    student, student_token = await actor(api_context, RoleCode.STUDENT)
    await connect(api_context, teacher, student)
    start = datetime(2020, 3, 1, tzinfo=UTC)
    end = start + timedelta(days=1)
    params = period(start, end)
    empty = await api_context.client.get(STUDENT_PATH, params=params, headers=auth(student_token))
    assert empty.status_code == 200
    assert empty.json()["attendance"]["attendance_rate"] is None
    assert empty.json()["homework"]["completion_rate"] is None
    assert empty.json()["reviews"] == {"graded_homework": 0, "average_grade": None}
    api_context.session.add(lesson(teacher, student, start))
    await api_context.session.commit()
    lesson_only = await api_context.client.get(
        teacher_path(student), params=params, headers=auth(teacher_token)
    )
    assert lesson_only.status_code == 200
    assert lesson_only.json()["attendance"]["unmarked_lessons"] == 1
    assert lesson_only.json()["homework"]["assigned"] == 0
    task = homework(teacher, student, start, end)
    task.status = HomeworkStatus.SUBMITTED
    next_period_task = homework(teacher, student, end, end + timedelta(days=1))
    api_context.session.add_all([task, next_period_task])
    api_context.session.add(attempt(task, 1, end)[0])
    await api_context.session.commit()
    homework_only = await api_context.client.get(
        STUDENT_PATH, params=period(end, end + timedelta(days=1)), headers=auth(student_token)
    )
    assert homework_only.status_code == 200
    assert homework_only.json()["attendance"]["total_lessons"] == 0
    assert homework_only.json()["homework"]["assigned"] == 1
    partial = await api_context.client.get(STUDENT_PATH, params=params, headers=auth(student_token))
    assert partial.status_code == 200
    assert partial.json()["homework"]["submitted"] == 1
    assert partial.json()["reviews"] == {"graded_homework": 0, "average_grade": None}


async def test_authorization_validation_and_timezone(api_context: ApiTestContext) -> None:
    teacher, teacher_token = await actor(api_context, RoleCode.TEACHER)
    stranger, stranger_token = await actor(api_context, RoleCode.TEACHER)
    student, student_token = await actor(api_context, RoleCode.STUDENT)
    other_student, other_token = await actor(api_context, RoleCode.STUDENT)
    _, admin_token = await actor(api_context, RoleCode.ADMIN)
    await connect(api_context, teacher, student)
    start = datetime(2020, 4, 1, tzinfo=UTC)
    end = start + timedelta(days=1)
    offset = timezone(timedelta(hours=4))
    api_context.session.add(lesson(teacher, student, start))
    api_context.session.add(homework(teacher, student, start, end))
    await api_context.session.commit()
    params = period(start.astimezone(offset), end.astimezone(offset))
    own = await api_context.client.get(STUDENT_PATH, params=params, headers=auth(student_token))
    assert own.status_code == 200
    assert own.json()["attendance"]["total_lessons"] == 1
    assert own.json()["homework"]["assigned"] == 1
    assert (await api_context.client.get(STUDENT_PATH, params=params)).status_code == 401
    assert (await api_context.client.get(teacher_path(student), params=params)).status_code == 401
    for token in (teacher_token, admin_token):
        assert (await api_context.client.get(
            STUDENT_PATH, params=params, headers=auth(token)
        )).status_code == 403
    for token in (student_token, admin_token):
        assert (await api_context.client.get(
            teacher_path(student), params=params, headers=auth(token)
        )).status_code == 403
    assert (await api_context.client.get(
        teacher_path(student), params=params, headers=auth(stranger_token)
    )).status_code == 404
    assert (await api_context.client.get(
        teacher_path(other_student), params=params, headers=auth(teacher_token)
    )).status_code == 404
    assert (await api_context.client.get(
        STUDENT_PATH, params={**params, "student_id": str(other_student.id)},
        headers=auth(student_token),
    )).status_code == 422
    other = await api_context.client.get(STUDENT_PATH, params=params, headers=auth(other_token))
    assert other.status_code == 200
    assert other.json()["attendance"]["total_lessons"] == 0
    assert other.json()["homework"]["assigned"] == 0
    for target, token in ((STUDENT_PATH, student_token), (teacher_path(student), teacher_token)):
        for invalid in (
            period(end, start),
            period(start, start),
            {"date_from": "2020-04-01T00:00:00", "date_to": end.isoformat()},
            {"date_from": start.isoformat()},
        ):
            response = await api_context.client.get(target, params=invalid, headers=auth(token))
            assert response.status_code == 422
    assert (await api_context.client.get(
        "/api/v1/teachers/me/students/not-a-uuid/progress",
        params=params, headers=auth(teacher_token),
    )).status_code == 422


async def test_aggregate_failure_is_not_reported_as_zero(
    api_context: ApiTestContext, monkeypatch: pytest.MonkeyPatch
) -> None:
    teacher, token = await actor(api_context, RoleCode.TEACHER)
    student, student_token = await actor(api_context, RoleCode.STUDENT)
    await connect(api_context, teacher, student)

    async def fail(*_args: object, **_kwargs: object) -> None:
        raise SQLAlchemyError("test database failure")

    monkeypatch.setattr("app.repositories.lessons.LessonRepository.list_student_history", fail)
    start = datetime(2020, 1, 1, tzinfo=UTC)
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        for path, current_token in ((teacher_path(student), token), (STUDENT_PATH, student_token)):
            response = await client.get(
                path, params=period(start, start + timedelta(days=1)),
                headers=auth(current_token),
            )
            assert response.status_code == 500
            assert "attendance" not in response.json()


async def test_openapi_progress_contracts() -> None:
    paths = app.openapi()["paths"]
    for path in (
        "/api/v1/teachers/me/students/{student_id}/progress",
        STUDENT_PATH,
    ):
        operation = paths[path]["get"]
        response_schema = operation["responses"]["200"]["content"]["application/json"]["schema"]
        assert response_schema["$ref"].endswith(
            "ProgressResponse"
        )
        names = {parameter["name"] for parameter in operation["parameters"]}
        assert {"date_from", "date_to"} <= names
