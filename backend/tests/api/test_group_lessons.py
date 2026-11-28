"""Group integration regressions; only the guarded rollback-only test DB fixture is used."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import event, func, select

from conftest import ApiTestContext
from app.core.security import TokenService, utc_now
from app.core.config import get_settings
from app.models.enums import AttendanceValue, RelationStatus, RoleCode
from app.models.lesson import Lesson, LessonParticipant
from app.models.profile import Profile
from app.models.role_profiles import StudentProfile, TeacherProfile
from app.models.teacher_student_relation import TeacherStudentRelation
from app.models.user import User

pytestmark = [pytest.mark.asyncio, pytest.mark.postgresql]


async def actor(context: ApiTestContext, role: RoleCode) -> tuple[User, str]:
    user = User(email=f"group-{uuid4().hex}@example.com", password_hash="test-only",
                role=role, is_active=True)
    user.profile = Profile(first_name=role.title(), last_name=uuid4().hex, timezone="Europe/Samara")
    if role == RoleCode.TEACHER:
        user.teacher_profile = TeacherProfile()
    else:
        user.student_profile = StudentProfile()
    context.session.add(user)
    await context.session.commit()
    token = TokenService(get_settings()).create_access_token(user_id=user.id, role=role).value
    context.session.expunge(user)
    return user, token


async def setup_group(context: ApiTestContext):
    teacher, token = await actor(context, RoleCode.TEACHER)
    students = [await actor(context, RoleCode.STUDENT) for _ in range(3)]
    context.session.add_all([TeacherStudentRelation(
        teacher_id=teacher.id, student_id=student.id, created_at=utc_now(),
    ) for student, _ in students])
    await context.session.commit()
    return teacher, token, students


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def body(students, start: datetime, **extra):
    return {"student_ids": [str(s.id) for s, _ in students], "title": "Group",
            "description": "Shared description", "starts_at": start.isoformat(),
            "duration_minutes": 60, **extra}


async def create(context, token, students, start, **extra):
    return await context.client.post("/api/v1/lessons", headers=auth(token),
                                     json=body(students, start, **extra))


async def count(context):
    return await context.session.scalar(select(func.count()).select_from(Lesson))


async def test_create_group_and_legacy_individual(api_context):
    _, token, students = await setup_group(api_context)
    start = utc_now() + timedelta(days=30)
    group = await create(api_context, token, students, start)
    assert group.status_code == 201
    assert group.json()["student_id"] is None
    assert group.json()["participant_count"] == 3
    assert set(group.json()["student_ids"]) == {str(s.id) for s, _ in students}
    old = body(students, start + timedelta(days=1))
    old.pop("student_ids")
    old["student_id"] = str(students[0][0].id)
    individual = await api_context.client.post("/api/v1/lessons", headers=auth(token), json=old)
    assert individual.status_code == 201
    assert individual.json()["student_id"] == old["student_id"]
    assert individual.json()["participant_count"] == 1
    assert await count(api_context) == 2


@pytest.mark.parametrize("invalid", ["empty", "duplicate", "both", "missing", "null", "foreign", "inactive", "inactive_user", "teacher"])
async def test_invalid_membership_never_creates_partial_lesson(api_context, invalid):
    teacher, token, students = await setup_group(api_context)
    request = body(students, utc_now() + timedelta(days=30))
    if invalid == "empty":
        request["student_ids"] = []
    elif invalid == "duplicate":
        request["student_ids"] = [str(students[0][0].id)] * 2
    elif invalid == "both":
        request["student_id"] = str(students[0][0].id)
    elif invalid == "missing":
        request.pop("student_ids")
    elif invalid == "null":
        request["student_ids"] = None
    elif invalid in ("foreign", "teacher"):
        request["student_ids"][-1] = str(uuid4() if invalid == "foreign" else teacher.id)
    elif invalid == "inactive_user":
        students[-1][0].is_active = False
        api_context.session.add(students[-1][0])
        await api_context.session.commit()
    else:
        relation = await api_context.session.scalar(select(TeacherStudentRelation).where(
            TeacherStudentRelation.teacher_id == teacher.id,
            TeacherStudentRelation.student_id == students[-1][0].id,
        ))
        relation.status = RelationStatus.INACTIVE
        relation.deactivated_at = utc_now()
        await api_context.session.commit()
    result = await api_context.client.post("/api/v1/lessons", headers=auth(token), json=request)
    assert result.status_code == (422 if invalid in {"empty", "duplicate", "both", "missing", "null"} else 404)
    assert await count(api_context) == 0


@pytest.mark.parametrize("series", [False, True])
@pytest.mark.parametrize("confirmed", [False, True])
async def test_any_participant_hard_conflict_has_priority_and_rejects_entire_series(api_context, series, confirmed):
    teacher, token, students = await setup_group(api_context)
    other, _ = await actor(api_context, RoleCode.TEACHER)
    start = utc_now() + timedelta(days=30)
    conflict_start = start + timedelta(weeks=1) if series else start
    # Multiple occupied participants: one private group, one teacher warning.
    api_context.session.add_all([
        Lesson(teacher_id=other.id, title="SECRET", description="PRIVATE",
               starts_at=conflict_start, duration_minutes=60,
               participants=[LessonParticipant(student_id=s.id) for s, _ in students[1:]]),
        Lesson(teacher_id=teacher.id, title="Warning", starts_at=start, duration_minutes=60,
               participants=[LessonParticipant(student_id=students[0][0].id)]),
    ])
    await api_context.session.commit()
    ids = [str(s.id) for s, _ in students[1:]]
    response = await api_context.client.post(
        "/api/v1/lessons/series" if series else "/api/v1/lessons", headers=auth(token),
        json=body(students, start, confirm_conflict=confirmed,
                  **({"recurrence": "weekly", "count": 3} if series else {})),
    )
    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "student_schedule_conflict"
    assert {c["student_id"] for c in error["context"]["conflicts"]} == set(ids)
    assert all(c["student_name"] and c["starts_at"] and c["ends_at"] for c in error["context"]["conflicts"])
    assert "SECRET" not in response.text and "PRIVATE" not in response.text
    assert str(other.id) not in response.text
    assert await count(api_context) == 2


async def test_weekly_group_has_one_lesson_per_date_and_independent_participants(api_context):
    _, token, students = await setup_group(api_context)
    response = await api_context.client.post("/api/v1/lessons/series", headers=auth(token),
        json=body(students, utc_now() + timedelta(days=30), recurrence="weekly", count=3))
    assert response.status_code == 201
    rows = response.json()
    assert len(rows) == len({r["id"] for r in rows}) == 3
    assert all(r["participant_count"] == 3 and r["student_id"] is None for r in rows)
    assert datetime.fromisoformat(rows[1]["starts_at"]) - datetime.fromisoformat(rows[0]["starts_at"]) == timedelta(weeks=1)
    assert await api_context.session.scalar(select(func.count()).select_from(LessonParticipant)) == 9


async def test_teacher_warning_confirmed_group_reschedule_failure_and_cancel(api_context):
    teacher, token, students = await setup_group(api_context)
    start = utc_now() + timedelta(days=30)
    first = await create(api_context, token, students, start)
    lesson_id = first.json()["id"]
    warning = await create(api_context, token, students, start + timedelta(minutes=30))
    assert warning.status_code == 409
    assert len(warning.json()["error"]["context"]["conflicts"]) == 1
    assert warning.json()["error"]["context"]["conflicts"][0]["student"] is None
    assert (await create(api_context, token, students, start + timedelta(minutes=30), confirm_conflict=True)).status_code == 201
    other, _ = await actor(api_context, RoleCode.TEACHER)
    target = start + timedelta(days=2)
    api_context.session.add(Lesson(teacher_id=other.id, title="Busy", starts_at=target, duration_minutes=60,
        participants=[LessonParticipant(student_id=students[-1][0].id)]))
    await api_context.session.commit()
    failed = await api_context.client.patch(f"/api/v1/lessons/{lesson_id}/schedule", headers=auth(token),
        json={"starts_at": target.isoformat(), "confirm_conflict": True})
    assert failed.status_code == 409
    unchanged = await api_context.client.get(f"/api/v1/lessons/{lesson_id}", headers=auth(token))
    assert unchanged.json()["starts_at"] == first.json()["starts_at"]
    moved = await api_context.client.patch(f"/api/v1/lessons/{lesson_id}/schedule", headers=auth(token),
        json={"starts_at": (target + timedelta(days=1)).isoformat()})
    assert moved.status_code == 200 and moved.json()["id"] == lesson_id
    assert {p["id"] for p in moved.json()["participants"]} == {str(s.id) for s, _ in students}
    cancelled = await api_context.client.post(f"/api/v1/lessons/{lesson_id}/cancel", headers=auth(token), json={"reason": "Reason"})
    assert cancelled.status_code == 200 and cancelled.json()["cancellation_reason"] == "Reason"
    assert len(cancelled.json()["participants"]) == 3
    assert (await create(api_context, token, students, target + timedelta(days=1))).status_code == 201


async def test_participant_attendance_reset_privacy_and_statistics(api_context, monkeypatch):
    teacher, token, students = await setup_group(api_context)
    now = datetime(2035, 2, 15, 12, tzinfo=UTC)
    monkeypatch.setattr("app.services.lessons.utc_now", lambda: now)
    monkeypatch.setattr("app.api.routes.lessons.utc_now", lambda: now)
    monkeypatch.setattr("app.api.routes.teachers.utc_now", lambda: now)
    monkeypatch.setattr("app.api.routes.students.utc_now", lambda: now)
    lesson = Lesson(teacher_id=teacher.id, title="Group", starts_at=now - timedelta(days=1), duration_minutes=60,
                    participants=[LessonParticipant(student_id=s.id) for s, _ in students])
    api_context.session.add(lesson)
    await api_context.session.commit()
    lesson_id = lesson.id
    path = f"/api/v1/lessons/{lesson_id}"
    missing = await api_context.client.put(path + "/attendance", headers=auth(token), json={"attendance": "present"})
    assert missing.status_code == 422
    for (student, _), value in zip(students, ["present", "absent", "not_set"]):
        marked = await api_context.client.put(path + "/attendance", headers=auth(token),
            json={"student_id": str(student.id), "attendance": value})
        assert marked.status_code == 200
    details = (await api_context.client.get(path, headers=auth(token))).json()
    assert {p["id"]: p["attendance"] for p in details["participants"]} == {
        str(s.id): value for (s, _), value in zip(students, ["present", "absent", "not_set"])
    }
    for student, student_token in students:
        response = await api_context.client.get(path, headers=auth(student_token))
        assert response.status_code == 200
        view = response.json()
        assert view["student"] is None and view["participant_count"] == 3
        assert all(set(p) == {"first_name", "last_name", "is_self"} for p in view["participants"])
        assert sum(p["is_self"] for p in view["participants"]) == 1
        assert all(str(peer.id) not in response.text for peer, _ in students)
        assert "email" not in response.text and "absent" not in str(view["participants"])
        schedule = await api_context.client.post("/api/v1/lessons/search", headers=auth(student_token), json={})
        assert len(schedule.json()) == 1
        assert schedule.json()[0]["participants"] == []
    stranger, stranger_token = await actor(api_context, RoleCode.STUDENT)
    assert (await api_context.client.get(path, headers=auth(stranger_token))).status_code == 404
    params = {"date_from": (now - timedelta(days=2)).isoformat(), "date_to": now.isoformat()}
    for (student, _), rate in zip(students, [100, 0, None]):
        progress = await api_context.client.get(f"/api/v1/teachers/me/students/{student.id}/progress", headers=auth(token), params=params)
        assert progress.status_code == 200
        assert progress.json()["attendance"]["total_lessons"] == 1
        assert progress.json()["attendance"]["attendance_rate"] == rate
    reset = await api_context.client.put(path + "/attendance", headers=auth(token),
        json={"student_id": str(students[0][0].id), "attendance": "not_set"})
    assert reset.status_code == 200
    participant = await api_context.session.get(LessonParticipant, (lesson_id, students[0][0].id))
    assert participant.attendance is None and participant.attendance_updated_at is None
    assert next(p for p in reset.json()["participants"] if p["id"] == str(students[1][0].id))["attendance"] == "absent"


async def test_shared_group_is_never_also_a_busy_interval(api_context):
    teacher, token, students = await setup_group(api_context)
    start = utc_now() + timedelta(days=30)
    response = await create(api_context, token, students, start)
    assert response.status_code == 201
    params = {"date_from": (start - timedelta(hours=1)).isoformat(), "date_to": (start + timedelta(days=1)).isoformat()}
    for student, student_token in students:
        for viewer, person in [(token, student.id), (student_token, teacher.id)]:
            schedule = await api_context.client.post(f"/api/v1/lessons/people/{person}/schedule", headers=auth(viewer), json=params)
            assert schedule.status_code == 200
            assert len(schedule.json()) == 1 and schedule.json()[0]["type"] == "lesson"


async def test_group_moves_between_periods_and_cancelled_marks_are_excluded(api_context, monkeypatch):
    teacher, token, students = await setup_group(api_context)
    now = datetime(2035, 1, 30, 12, tzinfo=UTC)
    monkeypatch.setattr("app.services.lessons.utc_now", lambda: now)
    monkeypatch.setattr("app.api.routes.lessons.utc_now", lambda: now)
    monkeypatch.setattr("app.api.routes.teachers.utc_now", lambda: now)
    monkeypatch.setattr("app.api.routes.students.utc_now", lambda: now)
    response = await create(api_context, token, students, now + timedelta(days=1))
    assert response.status_code == 201
    lesson_id = response.json()["id"]
    january = {"date_from": "2035-01-01T00:00:00Z", "date_to": "2035-02-01T00:00:00Z"}
    february = {"date_from": january["date_to"], "date_to": "2035-03-01T00:00:00Z"}
    moved = await api_context.client.patch(f"/api/v1/lessons/{lesson_id}/schedule", headers=auth(token),
        json={"starts_at": "2035-02-02T12:00:00Z"})
    assert moved.status_code == 200
    for student, student_token in students:
        path = f"/api/v1/teachers/me/students/{student.id}/lesson-history"
        for params, expected in [(january, 0), (february, 1)]:
            history = await api_context.client.get(path, headers=auth(token), params=params)
            assert history.status_code == 200
            assert history.json()["aggregates"]["total_lessons"] == expected
    # Mark and cancel while in progress, then inspect completed-period statistics.
    now = datetime(2035, 2, 2, 12, 30, tzinfo=UTC)
    marked = await api_context.client.put(f"/api/v1/lessons/{lesson_id}/attendance", headers=auth(token),
        json={"student_id": str(students[0][0].id), "attendance": "present"})
    assert marked.status_code == 200
    cancelled = await api_context.client.post(f"/api/v1/lessons/{lesson_id}/cancel", headers=auth(token))
    assert cancelled.status_code == 200
    now = datetime(2035, 2, 10, 12, tzinfo=UTC)
    for student, student_token in students:
        teacher_result = await api_context.client.get(f"/api/v1/teachers/me/students/{student.id}/progress", headers=auth(token), params=february)
        student_result = await api_context.client.get("/api/v1/students/me/progress", headers=auth(student_token), params=february)
        assert teacher_result.status_code == student_result.status_code == 200
        assert teacher_result.json()["attendance"] == student_result.json()["attendance"]
        stats = teacher_result.json()["attendance"]
        assert stats["cancelled_lessons"] == 1 and stats["completed_lessons"] == 0
        assert stats["attendance_rate"] is None


async def test_individual_attendance_can_be_reset_through_legacy_api(api_context, monkeypatch):
    teacher, token, students = await setup_group(api_context)
    now = utc_now()
    monkeypatch.setattr("app.services.lessons.utc_now", lambda: now)
    lesson = Lesson(teacher_id=teacher.id, title="Individual", starts_at=now - timedelta(days=1),
        duration_minutes=60, participants=[LessonParticipant(student_id=students[0][0].id,
            attendance=AttendanceValue.PRESENT, attendance_updated_at=now)])
    api_context.session.add(lesson)
    await api_context.session.commit()
    response = await api_context.client.put(f"/api/v1/lessons/{lesson.id}/attendance", headers=auth(token), json={"attendance": "not_set"})
    assert response.status_code == 200 and response.json()["attendance"] == "not_set"
    await api_context.session.refresh(lesson)
    assert lesson.participants[0].attendance is None
    assert lesson.participants[0].attendance_updated_at is None


@pytest.mark.parametrize("series", [False, True])
async def test_commit_failure_rolls_back_lesson_and_every_participant(api_context, monkeypatch, series):
    _, token, students = await setup_group(api_context)

    async def failure():
        # Force INSERTs first, so rollback is checked after real writes.
        await api_context.session.flush()
        raise RuntimeError("Simulated group commit failure")

    monkeypatch.setattr(api_context.session, "commit", failure)
    with pytest.raises(RuntimeError, match="Simulated group commit failure"):
        await api_context.client.post("/api/v1/lessons/series" if series else "/api/v1/lessons",
            headers=auth(token), json=body(students, utc_now() + timedelta(days=30),
                **({"recurrence": "weekly", "count": 3} if series else {})))
    assert await count(api_context) == 0
    assert await api_context.session.scalar(select(func.count()).select_from(LessonParticipant)) == 0


@pytest.mark.parametrize("cancelled", [False, True])
async def test_group_intervals_are_half_open_and_cancelled_groups_do_not_block(api_context, cancelled):
    _, token, students = await setup_group(api_context)
    other, _ = await actor(api_context, RoleCode.TEACHER)
    start = utc_now() + timedelta(days=30)
    api_context.session.add(Lesson(teacher_id=other.id, title="Other group", starts_at=start,
        duration_minutes=60, cancelled_at=utc_now() if cancelled else None,
        participants=[LessonParticipant(student_id=s.id) for s, _ in students]))
    await api_context.session.commit()
    candidate = start if cancelled else start + timedelta(hours=1)
    assert (await create(api_context, token, students, candidate)).status_code == 201


async def test_group_schedule_has_constant_queries_and_no_duplicates(api_context):
    teacher, token, students = await setup_group(api_context)
    start = utc_now() + timedelta(days=30)
    api_context.session.add_all([Lesson(teacher_id=teacher.id, title=f"Group {index}",
        starts_at=start + timedelta(days=index), duration_minutes=60,
        participants=[LessonParticipant(student_id=s.id) for s, _ in students]) for index in range(100)])
    await api_context.session.commit()
    statements = []

    def capture(*args):
        statements.append(args[2])

    bind = api_context.session.sync_session.get_bind()
    event.listen(bind, "before_cursor_execute", capture)
    try:
        result = await api_context.client.post("/api/v1/lessons/search", headers=auth(token), json={})
    finally:
        event.remove(bind, "before_cursor_execute", capture)
    assert result.status_code == 200
    rows = result.json()
    assert len(rows) == len({row["id"] for row in rows}) == 100
    assert all(len(row["participants"]) == 3 for row in rows)
    assert len(statements) <= 5


@pytest.mark.parametrize("cancelled", [False, True])
async def test_group_attendance_preserves_lifecycle_restrictions(api_context, cancelled):
    teacher, token, students = await setup_group(api_context)
    now = utc_now()
    lesson = Lesson(teacher_id=teacher.id, title="Restricted", duration_minutes=60,
        starts_at=now - timedelta(minutes=30) if cancelled else now + timedelta(days=1),
        cancelled_at=now if cancelled else None,
        participants=[LessonParticipant(student_id=s.id) for s, _ in students])
    api_context.session.add(lesson)
    await api_context.session.commit()
    lesson_id = lesson.id
    response = await api_context.client.put(f"/api/v1/lessons/{lesson_id}/attendance", headers=auth(token),
        json={"attendance": "present", "student_id": str(students[0][0].id)})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "attendance_not_available"
    participants = (await api_context.session.scalars(select(LessonParticipant).where(LessonParticipant.lesson_id == lesson_id))).all()
    assert len(participants) == 3 and all(p.attendance is None for p in participants)
