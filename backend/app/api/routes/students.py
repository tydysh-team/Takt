from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.dependencies.auth import (
    get_connection_service,
    get_current_student,
    get_current_teacher,
    get_progress_service,
)
from app.core.security import utc_now
from app.models.user import User
from app.repositories.teacher_student_relations import ConnectionRecord
from app.schemas.connections import (
    StudentConnection,
    StudentDetailResponse,
    StudentListItem,
    TeacherNoteUpdateRequest,
)
from app.schemas.error import ErrorResponse
from app.schemas.lessons import LessonHistoryRequest
from app.schemas.progress import ProgressResponse
from app.services.connections import ConnectionService
from app.services.progress import ProgressService

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
    "/me/progress",
    response_model=ProgressResponse,
    summary="Get the current student's progress",
    description=(
        "Student-only progress across all teachers. The authenticated student determines "
        "ownership. date_from is inclusive and date_to is exclusive. Historical lessons "
        "and homework remain included after a teacher connection becomes inactive."
    ),
    responses={
        403: {"model": ErrorResponse, "description": "Student role required"},
        422: {"model": ErrorResponse, "description": "Request validation failed"},
    },
)
async def get_own_progress(
    period: Annotated[LessonHistoryRequest, Query()],
    student: Annotated[User, Depends(get_current_student)],
    service: Annotated[ProgressService, Depends(get_progress_service)],
) -> ProgressResponse:
    return await service.for_student(student, period, now=utc_now())


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
