from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends

from app.api.dependencies.auth import (
    get_connection_service,
    get_current_student,
    get_current_teacher,
)
from app.models.user import User
from app.repositories.teacher_student_relations import ConnectionRecord
from app.schemas.connections import StudentRefDTO, TeacherListItem
from app.schemas.error import ErrorResponse
from app.services.connections import ConnectionService

router = APIRouter(prefix="/teachers", tags=["Teachers"])

teacher_errors: dict[int | str, dict[str, Any]] = {
    403: {"model": ErrorResponse, "description": "Student role required"},
    404: {"model": ErrorResponse, "description": "Active connection not found"},
}


def _teacher_response(record: ConnectionRecord) -> TeacherListItem:
    return TeacherListItem(
        id=record.user.id,
        first_name=record.profile.first_name,
        last_name=record.profile.last_name,
        email=record.user.email,
        timezone=record.profile.timezone,
        connected_at=record.relation.created_at,
    )


def _student_ref(record: ConnectionRecord) -> StudentRefDTO:
    return StudentRefDTO(
        id=record.user.id,
        first_name=record.profile.first_name,
        last_name=record.profile.last_name,
        middle_name=record.profile.middle_name,
    )


@router.get(
    "/me/students",
    response_model=list[StudentRefDTO],
    summary="List students available to the current teacher",
    responses={403: {"model": ErrorResponse, "description": "Teacher role required"}},
)
async def list_current_teacher_students(
    teacher: Annotated[User, Depends(get_current_teacher)],
    service: Annotated[ConnectionService, Depends(get_connection_service)],
) -> list[StudentRefDTO]:
    return [_student_ref(record) for record in await service.list_students(teacher)]


@router.get(
    "",
    response_model=list[TeacherListItem],
    summary="List connected teachers",
    description="Student-only list of teachers with an active relation to the current student.",
    responses={403: teacher_errors[403]},
)
async def list_teachers(
    student: Annotated[User, Depends(get_current_student)],
    service: Annotated[ConnectionService, Depends(get_connection_service)],
) -> list[TeacherListItem]:
    return [_teacher_response(record) for record in await service.list_teachers(student)]


@router.get(
    "/{teacher_id}",
    response_model=TeacherListItem,
    summary="Get a connected teacher",
    description="Requires an active relation between the current student and requested teacher.",
    responses=teacher_errors,
)
async def get_teacher(
    teacher_id: UUID,
    student: Annotated[User, Depends(get_current_student)],
    service: Annotated[ConnectionService, Depends(get_connection_service)],
) -> TeacherListItem:
    return _teacher_response(await service.get_teacher(student, teacher_id))
