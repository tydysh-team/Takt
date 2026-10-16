from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends

from app.api.dependencies.auth import get_connection_service, get_current_teacher
from app.models.user import User
from app.repositories.teacher_student_relations import ConnectionRecord
from app.schemas.connections import (
    StudentConnection,
    StudentDetailResponse,
    StudentListItem,
    TeacherNoteUpdateRequest,
)
from app.schemas.error import ErrorResponse
from app.services.connections import ConnectionService

router = APIRouter(prefix="/students", tags=["Students"])

student_errors: dict[int | str, dict[str, Any]] = {
    403: {"model": ErrorResponse, "description": "Teacher role required"},
    404: {"model": ErrorResponse, "description": "Active connection not found"},
}


def _list_item(record: ConnectionRecord) -> StudentListItem:
    return StudentListItem(
        id=record.user.id,
        first_name=record.profile.first_name,
        last_name=record.profile.last_name,
        email=record.user.email,
        timezone=record.profile.timezone,
        connected_at=record.relation.created_at,
        status=record.relation.status,
    )


def _detail(record: ConnectionRecord) -> StudentDetailResponse:
    return StudentDetailResponse(
        id=record.user.id,
        first_name=record.profile.first_name,
        last_name=record.profile.last_name,
        email=record.user.email,
        timezone=record.profile.timezone,
        connection=StudentConnection(
            status=record.relation.status,
            connected_at=record.relation.created_at,
            teacher_note=record.relation.teacher_note,
        ),
    )


@router.get(
    "",
    response_model=list[StudentListItem],
    summary="List connected students",
    description="Teacher-only list of students with an active relation to the current teacher.",
    responses={403: student_errors[403]},
)
async def list_students(
    teacher: Annotated[User, Depends(get_current_teacher)],
    service: Annotated[ConnectionService, Depends(get_connection_service)],
) -> list[StudentListItem]:
    return [_list_item(record) for record in await service.list_students(teacher)]


@router.get(
    "/{student_id}",
    response_model=StudentDetailResponse,
    summary="Get a connected student",
    description="Requires an active relation owned by the current teacher.",
    responses=student_errors,
)
async def get_student(
    student_id: UUID,
    teacher: Annotated[User, Depends(get_current_teacher)],
    service: Annotated[ConnectionService, Depends(get_connection_service)],
) -> StudentDetailResponse:
    return _detail(await service.get_student(teacher, student_id))


@router.patch(
    "/{student_id}/note",
    response_model=StudentDetailResponse,
    summary="Update a private teacher note",
    description="Updates the current teacher's private note on an active student relation.",
    responses={
        **student_errors,
        422: {"model": ErrorResponse, "description": "Request validation failed"},
    },
)
async def update_student_note(
    student_id: UUID,
    payload: TeacherNoteUpdateRequest,
    teacher: Annotated[User, Depends(get_current_teacher)],
    service: Annotated[ConnectionService, Depends(get_connection_service)],
) -> StudentDetailResponse:
    return _detail(await service.update_teacher_note(teacher, student_id, payload.note))
