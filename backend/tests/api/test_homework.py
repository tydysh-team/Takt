import asyncio
from collections.abc import AsyncIterator
from datetime import datetime, timedelta
from io import BytesIO
from typing import BinaryIO, Protocol, cast
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi import UploadFile
from sqlalchemy import delete, func, select
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.routes.homework import get_homework_storage
from app.core.config import get_settings
from app.core.security import TokenService, utc_now
from app.db.session import session_factory
from app.main import app
from app.models.enums import RelationStatus, RoleCode
from app.models.homework import (
    Homework,
    HomeworkAttachment,
    HomeworkReview,
    HomeworkStatus,
    HomeworkSubmission,
)
from app.models.profile import Profile
from app.models.role_profiles import StudentProfile, TeacherProfile
from app.models.teacher_student_relation import TeacherStudentRelation
from app.models.user import User
from app.schemas.homework import HomeworkReviewCreate
from app.services.homework import HomeworkFailure, HomeworkService
from app.storage.s3 import S3Storage

pytestmark = [pytest.mark.asyncio, pytest.mark.postgresql]


class ApiTestContext(Protocol):
    client: httpx.AsyncClient
    session: AsyncSession


class FakeStorage:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.fail_upload = False
        self.fail_after_write = False

    async def ensure_bucket(self) -> None:
        return None

    async def upload_object(self, key: str, source: BinaryIO, _mime_type: str) -> None:
        if self.fail_upload:
            raise OSError("RustFS unavailable")
        self.objects[key] = source.read()
        if self.fail_after_write:
            raise OSError("Upload response was lost")

    async def download_object(self, key: str) -> AsyncIterator[bytes]:
        if key not in self.objects:
            raise OSError("Object unavailable")

        async def chunks() -> AsyncIterator[bytes]:
            yield self.objects[key]

        return chunks()

    async def object_exists(self, key: str) -> bool:
        return key in self.objects

    async def delete_object(self, key: str) -> None:
        self.objects.pop(key, None)


async def account(context: ApiTestContext, role: str) -> tuple[str, str]:
    email = f"homework-{uuid4().hex}@example.com"
    response = await context.client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "StrongPass!123",
            "first_name": role.title(),
            "last_name": "Example",
            "role": role,
        },
    )
    assert response.status_code == 201
    login = await context.client.post(
        "/api/v1/auth/login", json={"email": email, "password": "StrongPass!123"}
    )
    assert login.status_code == 200
    return cast(str, response.json()["id"]), cast(str, login.json()["access_token"])


async def connect(context: ApiTestContext, teacher_token: str, student_token: str) -> None:
    invite = await context.client.post(
        "/api/v1/invitations", headers={"Authorization": f"Bearer {teacher_token}"}
    )
    assert invite.status_code == 201
    accepted = await context.client.post(
        "/api/v1/connections/accept",
        headers={"Authorization": f"Bearer {student_token}"},
        json={"code": invite.json()["code"]},
    )
    assert accepted.status_code == 200


def payload(student_id: str) -> dict[str, str]:
    return {
        "student_id": student_id,
        "title": "Прочитать главу",
        "description": "Страницы 1–10",
        "due_at": (utc_now() + timedelta(days=2)).isoformat(),
    }


def headers(token: str, key: str | None = None) -> dict[str, str]:
    result = {"Authorization": f"Bearer {token}"}
    if key is not None:
        result["Idempotency-Key"] = key
    return result


async def test_create_replay_ownership_and_file_download(api_context: ApiTestContext) -> None:
    storage = FakeStorage()
    app.dependency_overrides[get_homework_storage] = lambda: storage
    teacher_id, teacher_token = await account(api_context, "TEACHER")
    student_id, student_token = await account(api_context, "STUDENT")
    _, stranger_token = await account(api_context, "STUDENT")
    await connect(api_context, teacher_token, student_token)
    key = str(uuid4())
    request = payload(student_id)
    first = await api_context.client.post(
        "/api/v1/homework",
        headers=headers(teacher_token, key),
        data=request,
        files=[("files", ("task.txt", b"Read this", "text/plain"))],
    )
    assert first.status_code == 201, first.text
    assert first.json()["status"] == "assigned"
    assert first.json()["teacher_id"] == teacher_id
    assert first.json()["student_id"] == student_id
    assert first.json()["due_at"].endswith("Z") or "+00:00" in first.json()["due_at"]
    repeated = await api_context.client.post(
        "/api/v1/homework",
        headers=headers(teacher_token, key),
        data=request,
        files=[("files", ("task.txt", b"Read this", "text/plain"))],
    )
    assert repeated.status_code == 201
    assert repeated.json()["id"] == first.json()["id"]
    changed = await api_context.client.post(
        "/api/v1/homework", headers=headers(teacher_token, key), data={**request, "title": "Другое"}
    )
    assert changed.status_code == 409
    assert (
        int(await api_context.session.scalar(select(func.count()).select_from(Homework)) or 0) == 1
    )
    homework_id = first.json()["id"]
    own = await api_context.client.get(
        f"/api/v1/students/me/homework/{homework_id}", headers=headers(student_token)
    )
    foreign = await api_context.client.get(
        f"/api/v1/students/me/homework/{homework_id}", headers=headers(stranger_token)
    )
    assert own.status_code == 200
    assert foreign.status_code == 404
    foreign_submission = await api_context.client.post(
        f"/api/v1/homework/{homework_id}/submissions",
        headers=headers(stranger_token, str(uuid4())),
        data={"comment": "Чужая работа"},
    )
    assert foreign_submission.status_code == 404
    attachment_id = first.json()["attachments"][0]["id"]
    path = f"/api/v1/homework/{homework_id}/attachments/{attachment_id}/download"
    downloaded = await api_context.client.get(path, headers=headers(student_token))
    denied = await api_context.client.get(path, headers=headers(stranger_token))
    assert downloaded.status_code == 200 and downloaded.content == b"Read this"
    assert denied.status_code == 404
    listed = await api_context.client.get(
        "/api/v1/students/me/homework?limit=1", headers=headers(student_token)
    )
    assert listed.json()["total"] == 1


async def test_other_teacher_cannot_read_assignment(api_context: ApiTestContext) -> None:
    storage = FakeStorage()
    app.dependency_overrides[get_homework_storage] = lambda: storage
    _, teacher_token = await account(api_context, "TEACHER")
    _, other_teacher_token = await account(api_context, "TEACHER")
    student_id, student_token = await account(api_context, "STUDENT")
    await connect(api_context, teacher_token, student_token)
    response = await api_context.client.post(
        "/api/v1/homework",
        headers=headers(teacher_token, str(uuid4())),
        data=payload(student_id),
        files=[("files", ("task.txt", b"Read this", "text/plain"))],
    )
    assert response.status_code == 201
    homework_id = response.json()["id"]
    attachment_id = response.json()["attachments"][0]["id"]
    detail = await api_context.client.get(
        f"/api/v1/homework/{homework_id}", headers=headers(other_teacher_token)
    )
    download = await api_context.client.get(
        f"/api/v1/homework/{homework_id}/attachments/{attachment_id}/download",
        headers=headers(other_teacher_token),
    )
    listing = await api_context.client.get("/api/v1/homework", headers=headers(other_teacher_token))
    assert detail.status_code == 404
    assert download.status_code == 404
    assert listing.json()["total"] == 0


async def test_connection_roles_validation_and_storage_failure(api_context: ApiTestContext) -> None:
    storage = FakeStorage()
    app.dependency_overrides[get_homework_storage] = lambda: storage
    _, teacher_token = await account(api_context, "TEACHER")
    student_id, student_token = await account(api_context, "STUDENT")
    key = str(uuid4())
    request = payload(student_id)
    missing_relation = await api_context.client.post(
        "/api/v1/homework", headers=headers(teacher_token, key), data=request
    )
    wrong_role = await api_context.client.post(
        "/api/v1/homework", headers=headers(student_token, key), data=request
    )
    assert missing_relation.status_code == 404
    assert wrong_role.status_code == 403
    await connect(api_context, teacher_token, student_token)
    bad_file = await api_context.client.post(
        "/api/v1/homework",
        headers=headers(teacher_token, key),
        data=request,
        files=[("files", ("run.exe", b"MZ", "application/octet-stream"))],
    )
    assert bad_file.status_code == 422
    storage.fail_upload = True
    failed = await api_context.client.post(
        "/api/v1/homework",
        headers=headers(teacher_token, key),
        data=request,
        files=[("files", ("task.txt", b"Read this", "text/plain"))],
    )
    assert failed.status_code == 503
    assert not storage.objects
    assert (
        int(await api_context.session.scalar(select(func.count()).select_from(Homework)) or 0) == 0
    )
    storage.fail_upload = False
    storage.fail_after_write = True
    partial = await api_context.client.post(
        "/api/v1/homework",
        headers=headers(teacher_token, key),
        data=request,
        files=[("files", ("task.txt", b"Read this", "text/plain"))],
    )
    assert partial.status_code == 503
    assert not storage.objects
    storage.fail_after_write = False
    created = await api_context.client.post(
        "/api/v1/homework", headers=headers(teacher_token, key), data=request
    )
    assert created.status_code == 201
    relation = await api_context.session.scalar(
        select(TeacherStudentRelation).where(TeacherStudentRelation.student_id == UUID(student_id))
    )
    assert relation is not None
    relation.status = RelationStatus.INACTIVE
    relation.deactivated_at = utc_now()
    await api_context.session.commit()
    unavailable = await api_context.client.post(
        "/api/v1/homework", headers=headers(teacher_token, str(uuid4())), data=request
    )
    assert unavailable.status_code == 404


async def test_submission_replay_late_queue_and_ownership(api_context: ApiTestContext) -> None:
    storage = FakeStorage()
    app.dependency_overrides[get_homework_storage] = lambda: storage
    _, teacher_token = await account(api_context, "TEACHER")
    _, other_teacher_token = await account(api_context, "TEACHER")
    student_id, student_token = await account(api_context, "STUDENT")
    await connect(api_context, teacher_token, student_token)
    request = payload(student_id)
    request["due_at"] = (utc_now() - timedelta(seconds=1)).isoformat()
    assignment = await api_context.client.post(
        "/api/v1/homework", headers=headers(teacher_token, str(uuid4())), data=request
    )
    assert assignment.status_code == 201, assignment.text
    homework_id = assignment.json()["id"]
    path = f"/api/v1/homework/{homework_id}/submissions"
    key = str(uuid4())
    wrong_role = await api_context.client.post(
        path, headers=headers(teacher_token, key), data={"comment": "Ответ"}
    )
    empty = await api_context.client.post(
        path, headers=headers(student_token, key), data={"comment": "  "}
    )
    assert wrong_role.status_code == 403
    assert empty.status_code == 422
    first = await api_context.client.post(
        path, headers=headers(student_token, key), data={"comment": "Решение готово"}
    )
    assert first.status_code == 201, first.text
    body = first.json()
    assert body["submission"]["attempt_no"] == 1
    assert body["submission"]["is_late"] is True
    assert body["submission"]["attachments"] == []
    assert body["homework"]["status"] == "submitted"
    submitted_at = datetime.fromisoformat(body["submission"]["submitted_at"].replace("Z", "+00:00"))
    assert submitted_at > datetime.fromisoformat(request["due_at"])
    replay = await api_context.client.post(
        path, headers=headers(student_token, key), data={"comment": "Решение готово"}
    )
    changed = await api_context.client.post(
        path, headers=headers(student_token, key), data={"comment": "Другое решение"}
    )
    duplicate = await api_context.client.post(
        path, headers=headers(student_token, str(uuid4())), data={"comment": "Другое решение"}
    )
    assert (
        replay.status_code == 201 and replay.json()["submission"]["id"] == body["submission"]["id"]
    )
    assert changed.status_code == 409 and duplicate.status_code == 409
    own = await api_context.client.get(
        f"/api/v1/students/me/homework/{homework_id}", headers=headers(student_token)
    )
    assert own.json()["latest_submission"]["id"] == body["submission"]["id"]
    second_homework = await api_context.client.post(
        "/api/v1/homework",
        headers=headers(teacher_token, str(uuid4())),
        data={**payload(student_id), "title": "Второе задание"},
    )
    assert second_homework.status_code == 201
    second_submission = await api_context.client.post(
        f"/api/v1/homework/{second_homework.json()['id']}/submissions",
        headers=headers(student_token, str(uuid4())),
        data={"comment": "Второй ответ"},
    )
    assert second_submission.status_code == 201
    queue_path = "/api/v1/teachers/me/homework/submissions/pending?limit=1&offset=0"
    queue = await api_context.client.get(queue_path, headers=headers(teacher_token))
    next_page = await api_context.client.get(
        "/api/v1/teachers/me/homework/submissions/pending?limit=1&offset=1",
        headers=headers(teacher_token),
    )
    foreign_queue = await api_context.client.get(queue_path, headers=headers(other_teacher_token))
    student_queue = await api_context.client.get(queue_path, headers=headers(student_token))
    assert queue.status_code == 200 and queue.json()["total"] == 2
    assert queue.json()["items"][0]["id"] == second_submission.json()["submission"]["id"]
    assert next_page.json()["items"][0]["id"] == body["submission"]["id"]
    assert foreign_queue.json()["total"] == 0
    assert student_queue.status_code == 403
    detail_path = f"/api/v1/teachers/me/homework/submissions/{body['submission']['id']}"
    assert (
        await api_context.client.get(detail_path, headers=headers(teacher_token))
    ).status_code == 200
    assert (
        await api_context.client.get(detail_path, headers=headers(other_teacher_token))
    ).status_code == 404
    assert (
        await api_context.client.get(detail_path, headers=headers(student_token))
    ).status_code == 403
    assert (
        int(
            await api_context.session.scalar(select(func.count()).select_from(HomeworkSubmission))
            or 0
        )
        == 2
    )
    homework = await api_context.session.get(Homework, UUID(homework_id))
    assert homework is not None
    homework.status = HomeworkStatus.REVIEWED
    await api_context.session.commit()
    checked = await api_context.client.get(queue_path, headers=headers(teacher_token))
    assert checked.json()["total"] == 1


async def test_submission_file_storage_and_failed_upload(api_context: ApiTestContext) -> None:
    storage = FakeStorage()
    app.dependency_overrides[get_homework_storage] = lambda: storage
    _, teacher_token = await account(api_context, "TEACHER")
    _, other_teacher_token = await account(api_context, "TEACHER")
    student_id, student_token = await account(api_context, "STUDENT")
    await connect(api_context, teacher_token, student_token)
    assignment = await api_context.client.post(
        "/api/v1/homework", headers=headers(teacher_token, str(uuid4())), data=payload(student_id)
    )
    assert assignment.status_code == 201
    homework_id = assignment.json()["id"]
    path = f"/api/v1/homework/{homework_id}/submissions"
    key = str(uuid4())
    storage.fail_after_write = True
    failed = await api_context.client.post(
        path,
        headers=headers(student_token, key),
        files=[("files", ("answer.txt", b"Answer", "text/plain"))],
    )
    assert failed.status_code == 503 and not storage.objects
    assert (
        int(
            await api_context.session.scalar(select(func.count()).select_from(HomeworkSubmission))
            or 0
        )
        == 0
    )
    homework = await api_context.session.get(Homework, UUID(homework_id))
    assert homework is not None and homework.status == HomeworkStatus.ASSIGNED
    storage.fail_after_write = False
    storage.fail_upload = True
    unavailable = await api_context.client.post(
        path,
        headers=headers(student_token, key),
        files=[("files", ("answer.txt", b"Answer", "text/plain"))],
    )
    assert unavailable.status_code == 503 and not storage.objects
    storage.fail_upload = False
    success = await api_context.client.post(
        path,
        headers=headers(student_token, key),
        files=[("files", ("answer.txt", b"Answer", "text/plain"))],
    )
    assert success.status_code == 201, success.text
    assert success.json()["submission"]["is_late"] is False
    attachment_id = success.json()["submission"]["attachments"][0]["id"]
    submission_id = success.json()["submission"]["id"]
    assert list(storage.objects.values()) == [b"Answer"]
    assert next(iter(storage.objects)).startswith(f"submissions/{submission_id}/")
    attachment = await api_context.session.get(HomeworkAttachment, UUID(attachment_id))
    assert attachment is not None and attachment.sha256
    download_path = (
        f"/api/v1/teachers/me/homework/submissions/{submission_id}"
        f"/attachments/{attachment_id}/download"
    )
    downloaded = await api_context.client.get(download_path, headers=headers(teacher_token))
    denied = await api_context.client.get(download_path, headers=headers(other_teacher_token))
    assert downloaded.status_code == 200 and downloaded.content == b"Answer"
    assert denied.status_code == 404
    replay = await api_context.client.post(
        path,
        headers=headers(student_token, key),
        files=[("files", ("answer.txt", b"Answer", "text/plain"))],
    )
    assert replay.status_code == 201 and replay.json()["submission"]["id"] == submission_id
    assert len(storage.objects) == 1
    assert (
        int(
            await api_context.session.scalar(select(func.count()).select_from(HomeworkAttachment))
            or 0
        )
        == 1
    )


async def test_submission_commit_failure_removes_uploaded_object(
    api_context: ApiTestContext,
) -> None:
    storage = FakeStorage()
    app.dependency_overrides[get_homework_storage] = lambda: storage
    _, teacher_token = await account(api_context, "TEACHER")
    student_id, student_token = await account(api_context, "STUDENT")
    await connect(api_context, teacher_token, student_token)
    assignment = await api_context.client.post(
        "/api/v1/homework", headers=headers(teacher_token, str(uuid4())), data=payload(student_id)
    )
    assert assignment.status_code == 201
    homework_id = UUID(assignment.json()["id"])
    student = await api_context.session.get(User, UUID(student_id))
    assert student is not None
    upload = UploadFile(file=BytesIO(b"Answer"), filename="answer.txt")
    with (
        patch.object(
            api_context.session, "commit", new=AsyncMock(side_effect=RuntimeError("DB failure"))
        ),
        pytest.raises(RuntimeError, match="DB failure"),
    ):
        await HomeworkService(api_context.session, cast(S3Storage, storage)).submit(
            student, homework_id, None, [upload], uuid4()
        )
    assert not storage.objects
    assert (
        int(
            await api_context.session.scalar(select(func.count()).select_from(HomeworkSubmission))
            or 0
        )
        == 0
    )
    homework = await api_context.session.get(Homework, homework_id)
    assert homework is not None and homework.status == HomeworkStatus.ASSIGNED


async def test_review_revision_resubmit_history_and_access(api_context: ApiTestContext) -> None:
    storage = FakeStorage()
    app.dependency_overrides[get_homework_storage] = lambda: storage
    _, teacher_token = await account(api_context, "TEACHER")
    _, other_teacher_token = await account(api_context, "TEACHER")
    student_id, student_token = await account(api_context, "STUDENT")
    other_student_id = uuid4()
    other_student = User(
        id=other_student_id,
        email=f"history-student-{other_student_id.hex}@example.com",
        password_hash="unused",
        role=RoleCode.STUDENT,
        is_active=True,
    )
    other_student.profile = Profile(first_name="Other", last_name="Student")
    other_student.student_profile = StudentProfile()
    api_context.session.add(other_student)
    await api_context.session.commit()
    other_student_token = (
        TokenService(get_settings())
        .create_access_token(user_id=other_student_id, role=RoleCode.STUDENT)
        .value
    )
    await connect(api_context, teacher_token, student_token)
    assignment = await api_context.client.post(
        "/api/v1/homework", headers=headers(teacher_token, str(uuid4())),
        data={**payload(student_id), "due_at": (utc_now() - timedelta(days=1)).isoformat()},
    )
    assert assignment.status_code == 201, assignment.text
    homework_id = assignment.json()["id"]
    submission_path = f"/api/v1/homework/{homework_id}/submissions"
    first = await api_context.client.post(
        submission_path, headers=headers(student_token, str(uuid4())),
        files=[("files", ("answer.txt", b"First answer", "text/plain"))],
    )
    assert first.status_code == 201, first.text
    first_attempt = first.json()["submission"]
    assert first_attempt["attempt_no"] == 1 and first_attempt["is_late"] is True
    first_id = first_attempt["id"]
    revision_path = f"/api/v1/teachers/me/homework/submissions/{first_id}/revision"
    accept_path = f"/api/v1/teachers/me/homework/submissions/{first_id}/review"
    assert (await api_context.client.post(
        revision_path, headers=headers(teacher_token), json={"comment": "   "}
    )).status_code == 422
    assert (await api_context.client.post(
        accept_path, headers=headers(teacher_token), json={"grade": 101}
    )).status_code == 422
    assert (await api_context.client.post(
        revision_path, headers=headers(other_teacher_token), json={"comment": "Чужая"}
    )).status_code == 404
    assert (await api_context.client.post(
        revision_path, headers=headers(student_token), json={"comment": "Нет"}
    )).status_code == 403
    revision = await api_context.client.post(
        revision_path, headers=headers(teacher_token), json={"comment": "Исправьте пункт 2"}
    )
    assert revision.status_code == 200, revision.text
    assert revision.json()["review"]["decision"] == "needs_revision"
    assert (await api_context.client.post(
        revision_path, headers=headers(teacher_token), json={"comment": "Повтор"}
    )).status_code == 409
    queue_path = "/api/v1/teachers/me/homework/submissions/pending"
    queue = await api_context.client.get(queue_path, headers=headers(teacher_token))
    assert queue.json()["total"] == 0
    student_detail = await api_context.client.get(
        f"/api/v1/students/me/homework/{homework_id}", headers=headers(student_token)
    )
    assert student_detail.json()["status"] == "needs_revision"
    assert student_detail.json()["latest_submission"]["review"]["comment"] == "Исправьте пункт 2"

    student_history_path = f"/api/v1/students/me/homework/{homework_id}/submissions"
    teacher_history_path = f"/api/v1/teachers/me/homework/{homework_id}/submissions"
    assert (await api_context.client.get(
        student_history_path, headers=headers(other_student_token)
    )).status_code == 404
    assert (await api_context.client.get(
        teacher_history_path, headers=headers(other_teacher_token)
    )).status_code == 404
    first_attachment = first_attempt["attachments"][0]["id"]
    student_download = (
        f"/api/v1/students/me/homework/{homework_id}/submissions/{first_id}"
        f"/attachments/{first_attachment}/download"
    )
    assert (await api_context.client.get(
        student_download, headers=headers(student_token)
    )).content == b"First answer"
    assert (await api_context.client.get(
        student_download, headers=headers(other_student_token)
    )).status_code == 404

    resubmit_key = str(uuid4())
    second = await api_context.client.post(
        submission_path, headers=headers(student_token, resubmit_key),
        data={"comment": "Исправленный ответ"},
    )
    assert second.status_code == 201, second.text
    second_attempt = second.json()["submission"]
    assert second_attempt["attempt_no"] == 2 and second_attempt["is_late"] is True
    replay = await api_context.client.post(
        submission_path, headers=headers(student_token, resubmit_key),
        data={"comment": "Исправленный ответ"},
    )
    assert replay.status_code == 201 and replay.json()["submission"]["id"] == second_attempt["id"]
    assert (await api_context.client.post(
        submission_path, headers=headers(student_token, str(uuid4())),
        data={"comment": "Третья"},
    )).status_code == 409
    history = await api_context.client.get(teacher_history_path, headers=headers(teacher_token))
    assert history.status_code == 200, history.text
    assert [item["attempt_no"] for item in history.json()] == [1, 2]
    assert history.json()[0]["review"]["comment"] == "Исправьте пункт 2"
    assert history.json()[0]["attachments"][0]["id"] == first_attachment
    assert history.json()[1]["review"] is None
    queue = await api_context.client.get(queue_path, headers=headers(teacher_token))
    assert queue.json()["total"] == 1 and queue.json()["items"][0]["id"] == second_attempt["id"]
    accepted = await api_context.client.post(
        f"/api/v1/teachers/me/homework/submissions/{second_attempt['id']}/review",
        headers=headers(teacher_token), json={"grade": 0, "comment": "Теперь верно"},
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["review"]["grade"] == 0
    assert (await api_context.client.post(
        accept_path, headers=headers(teacher_token), json={"grade": 100}
    )).status_code == 409
    assert (await api_context.client.post(
        f"/api/v1/teachers/me/homework/submissions/{second_attempt['id']}/review",
        headers=headers(teacher_token), json={"grade": 100},
    )).status_code == 409
    queue = await api_context.client.get(queue_path, headers=headers(teacher_token))
    assert queue.json()["total"] == 0
    final = await api_context.client.get(student_history_path, headers=headers(student_token))
    assert [item["review"]["decision"] for item in final.json()] == ["needs_revision", "accepted"]
    assert len(storage.objects) == 1
    review_count = await api_context.session.scalar(
        select(func.count()).select_from(HomeworkReview)
    )
    assert int(review_count or 0) == 2


async def test_concurrent_submission_requests_create_one_attempt() -> None:
    settings = get_settings()
    assert make_url(settings.database_url).database == "takt_test"
    assert settings.test_database_url is not None
    assert make_url(settings.test_database_url).database == "takt_test"
    teacher_id, student_id, homework_id, key = uuid4(), uuid4(), uuid4(), uuid4()
    teacher = User(
        id=teacher_id,
        email=f"submission-teacher-{teacher_id.hex}@example.com",
        password_hash="unused",
        role=RoleCode.TEACHER,
        is_active=True,
    )
    teacher.profile = Profile(first_name="Teacher", last_name="Example")
    teacher.teacher_profile = TeacherProfile()
    student = User(
        id=student_id,
        email=f"submission-student-{student_id.hex}@example.com",
        password_hash="unused",
        role=RoleCode.STUDENT,
        is_active=True,
    )
    student.profile = Profile(first_name="Student", last_name="Example")
    student.student_profile = StudentProfile()
    try:
        async with session_factory() as session:
            session.add_all([teacher, student])
            await session.flush()
            session.add(
                Homework(
                    id=homework_id,
                    teacher_id=teacher_id,
                    student_id=student_id,
                    title="Конкурентная отправка",
                    due_at=utc_now() + timedelta(days=1),
                    status=HomeworkStatus.ASSIGNED,
                    idempotency_key=uuid4(),
                    request_fingerprint="0" * 64,
                )
            )
            await session.commit()
        token = (
            TokenService(settings)
            .create_access_token(user_id=student_id, role=RoleCode.STUDENT)
            .value
        )
        path = f"/api/v1/homework/{homework_id}/submissions"
        barrier = asyncio.Barrier(2)
        async with (
            httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app, client=("127.0.0.1", 31001)),
                base_url="http://testserver",
            ) as first,
            httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app, client=("127.0.0.1", 31002)),
                base_url="http://testserver",
            ) as second,
        ):

            async def send(client: httpx.AsyncClient) -> httpx.Response:
                await barrier.wait()
                return await client.post(
                    path, headers=headers(token, str(key)), data={"comment": "Ответ"}
                )

            responses = await asyncio.gather(send(first), send(second))
            assert [response.status_code for response in responses] == [201, 201]
            assert (
                responses[0].json()["submission"]["id"] == responses[1].json()["submission"]["id"]
            )
            different = await first.post(
                path, headers=headers(token, str(uuid4())), data={"comment": "Другой ответ"}
            )
            assert different.status_code == 409
        async with session_factory() as session:
            count = await session.scalar(
                select(func.count())
                .select_from(HomeworkSubmission)
                .where(HomeworkSubmission.homework_id == homework_id)
            )
            assert count == 1
    finally:
        async with session_factory() as session:
            await session.execute(delete(User).where(User.id.in_([teacher_id, student_id])))
            await session.commit()


async def test_concurrent_review_requests_apply_one_decision() -> None:
    settings = get_settings()
    assert settings.test_database_url is not None
    assert make_url(settings.test_database_url).database == "takt_test"
    review_engine = create_async_engine(settings.test_database_url, pool_pre_ping=True)
    review_sessions = async_sessionmaker(review_engine, expire_on_commit=False, autoflush=False)
    teacher_id, student_id, homework_id, submission_id = uuid4(), uuid4(), uuid4(), uuid4()
    teacher = User(
        id=teacher_id,
        email=f"review-teacher-{teacher_id.hex}@example.com",
        password_hash="unused",
        role=RoleCode.TEACHER,
        is_active=True,
    )
    teacher.profile = Profile(first_name="Teacher", last_name="Example")
    teacher.teacher_profile = TeacherProfile()
    student = User(
        id=student_id,
        email=f"review-student-{student_id.hex}@example.com",
        password_hash="unused",
        role=RoleCode.STUDENT,
        is_active=True,
    )
    student.profile = Profile(first_name="Student", last_name="Example")
    student.student_profile = StudentProfile()
    try:
        async with review_sessions() as session:
            session.add_all([teacher, student])
            await session.flush()
            session.add(Homework(
                id=homework_id, teacher_id=teacher_id, student_id=student_id,
                title="Одновременная проверка", due_at=utc_now() + timedelta(days=1),
                status=HomeworkStatus.SUBMITTED, idempotency_key=uuid4(),
                request_fingerprint="0" * 64,
            ))
            await session.flush()
            session.add(HomeworkSubmission(
                id=submission_id, homework_id=homework_id, attempt_no=1,
                comment="Ответ", submitted_at=utc_now(), is_late=False,
                idempotency_key=uuid4(), request_fingerprint="1" * 64,
            ))
            await session.commit()
        barrier = asyncio.Barrier(2)

        async def review() -> int:
            async with review_sessions() as session:
                await barrier.wait()
                try:
                    await HomeworkService(session).review_submission(
                        teacher, submission_id,
                        accepted=HomeworkReviewCreate(grade=85, comment="Проверено"),
                    )
                except HomeworkFailure as exc:
                    return exc.status
                return 200

        results = await asyncio.gather(review(), review())
        assert sorted(results) == [200, 409]
        async with review_sessions() as session:
            homework = await session.get(Homework, homework_id)
            assert homework is not None and homework.status == HomeworkStatus.REVIEWED
            count = await session.scalar(
                select(func.count()).select_from(HomeworkReview)
                .where(HomeworkReview.submission_id == submission_id)
            )
            assert count == 1
    finally:
        async with review_sessions() as session:
            await session.execute(delete(User).where(User.id.in_([teacher_id, student_id])))
            await session.commit()
        await review_engine.dispose()


async def test_failed_review_commit_keeps_submission_pending(api_context: ApiTestContext) -> None:
    teacher_id, teacher_token = await account(api_context, "TEACHER")
    student_id, student_token = await account(api_context, "STUDENT")
    await connect(api_context, teacher_token, student_token)
    assignment = await api_context.client.post(
        "/api/v1/homework", headers=headers(teacher_token, str(uuid4())),
        data=payload(student_id),
    )
    assert assignment.status_code == 201
    homework_id = assignment.json()["id"]
    submission = await api_context.client.post(
        f"/api/v1/homework/{homework_id}/submissions",
        headers=headers(student_token, str(uuid4())), data={"comment": "Ответ"},
    )
    assert submission.status_code == 201
    submission_id = UUID(submission.json()["submission"]["id"])
    teacher = await api_context.session.get(User, UUID(teacher_id))
    assert teacher is not None
    with (
        patch.object(
            api_context.session, "commit", new=AsyncMock(side_effect=RuntimeError("DB failure"))
        ),
        pytest.raises(RuntimeError, match="DB failure"),
    ):
        await HomeworkService(api_context.session).review_submission(
            teacher, submission_id, accepted=HomeworkReviewCreate(grade=85, comment="Верно")
        )
    await api_context.session.refresh(teacher)
    homework = await api_context.session.get(Homework, UUID(homework_id))
    assert homework is not None and homework.status == HomeworkStatus.SUBMITTED
    count = await api_context.session.scalar(
        select(func.count()).select_from(HomeworkReview)
        .where(HomeworkReview.submission_id == submission_id)
    )
    assert count == 0
    pending = await api_context.client.get(
        "/api/v1/teachers/me/homework/submissions/pending", headers=headers(teacher_token)
    )
    assert pending.json()["total"] == 1
