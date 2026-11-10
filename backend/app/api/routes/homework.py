from datetime import datetime
from typing import Annotated
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Header, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import (
    get_current_active_user,
    get_current_student,
    get_current_teacher,
)
from app.core.config import Settings, get_settings
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.homework import HomeworkCreate, HomeworkDTO, HomeworkPage
from app.services.homework import HomeworkFailure, HomeworkService
from app.storage.s3 import S3Storage

router = APIRouter(tags=["Homework"])


def get_homework_storage(settings: Annotated[Settings, Depends(get_settings)]) -> S3Storage | None:
    return S3Storage(settings) if settings.s3_access_key and settings.s3_secret_key else None


def get_homework_service(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> HomeworkService:
    return HomeworkService(session)


@router.post("/homework", response_model=HomeworkDTO, status_code=201)
async def create_homework(
    teacher: Annotated[User, Depends(get_current_teacher)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    storage: Annotated[S3Storage | None, Depends(get_homework_storage)],
    idempotency_key: Annotated[UUID, Header(alias="Idempotency-Key")],
    student_id: Annotated[UUID, Form()],
    title: Annotated[str, Form()],
    due_at: Annotated[datetime, Form()],
    description: Annotated[str | None, Form()] = None,
    files: Annotated[list[UploadFile] | None, File()] = None,
) -> HomeworkDTO:
    try:
        payload = HomeworkCreate(
            student_id=student_id, title=title, description=description, due_at=due_at
        )
    except ValidationError as exc:
        from fastapi.exceptions import RequestValidationError

        raise RequestValidationError(exc.errors()) from exc
    return await HomeworkService(session, storage).create(
        teacher, payload, files or [], idempotency_key
    )


@router.get("/homework", response_model=HomeworkPage)
async def teacher_homework(
    teacher: Annotated[User, Depends(get_current_teacher)],
    service: Annotated[HomeworkService, Depends(get_homework_service)],
    student_id: UUID | None = None,
    limit: int = 20,
    offset: int = 0,
) -> HomeworkPage:
    if not 1 <= limit <= 100 or offset < 0:
        from fastapi import HTTPException

        raise HTTPException(422, "Invalid pagination")
    return await service.list_page(teacher, student_id, limit, offset)


@router.get("/homework/{homework_id}", response_model=HomeworkDTO)
async def teacher_homework_detail(
    homework_id: UUID,
    teacher: Annotated[User, Depends(get_current_teacher)],
    service: Annotated[HomeworkService, Depends(get_homework_service)],
) -> HomeworkDTO:
    return await service.get(teacher, homework_id)


@router.get("/students/me/homework", response_model=HomeworkPage)
async def student_homework(
    student: Annotated[User, Depends(get_current_student)],
    service: Annotated[HomeworkService, Depends(get_homework_service)],
    teacher_id: UUID | None = None,
    limit: int = 20,
    offset: int = 0,
) -> HomeworkPage:
    if not 1 <= limit <= 100 or offset < 0:
        from fastapi import HTTPException

        raise HTTPException(422, "Invalid pagination")
    return await service.list_page(student, teacher_id, limit, offset)


@router.get("/students/me/homework/{homework_id}", response_model=HomeworkDTO)
async def student_homework_detail(
    homework_id: UUID,
    student: Annotated[User, Depends(get_current_student)],
    service: Annotated[HomeworkService, Depends(get_homework_service)],
) -> HomeworkDTO:
    return await service.get(student, homework_id)


@router.get("/homework/{homework_id}/attachments/{attachment_id}/download")
async def download_homework_attachment(
    homework_id: UUID,
    attachment_id: UUID,
    user: Annotated[User, Depends(get_current_active_user)],
    service: Annotated[HomeworkService, Depends(get_homework_service)],
    storage: Annotated[S3Storage | None, Depends(get_homework_storage)],
) -> StreamingResponse:
    attachment = await service.attachment(user, homework_id, attachment_id)
    if storage is None:
        raise HomeworkFailure("storage_unavailable", "Хранилище файлов недоступно.", 503)
    try:
        stream = await storage.download_object(attachment.storage_key)
    except HomeworkFailure:
        raise
    except Exception as exc:
        raise HomeworkFailure("storage_unavailable", "Хранилище файлов недоступно.", 503) from exc
    filename = quote(attachment.original_name, safe="")
    return StreamingResponse(
        stream,
        media_type=attachment.mime_type,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{filename}",
            "Content-Length": str(attachment.size_bytes),
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )
