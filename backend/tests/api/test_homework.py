from collections.abc import AsyncIterator
from datetime import timedelta
from typing import BinaryIO, Protocol, cast
from uuid import UUID, uuid4

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.homework import get_homework_storage
from app.core.security import utc_now
from app.main import app
from app.models.enums import RelationStatus
from app.models.homework import Homework
from app.models.teacher_student_relation import TeacherStudentRelation

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
    listing = await api_context.client.get(
        "/api/v1/homework", headers=headers(other_teacher_token)
    )
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
