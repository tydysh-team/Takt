from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import (
    get_connection_service,
    get_current_student,
    get_current_teacher,
    get_lesson_service,
)
from app.core.security import utc_now
from app.db.session import get_db_session
from app.models.user import User
from app.repositories.teacher_student_relations import ConnectionRecord
from app.schemas.connections import StudentRefDTO, TeacherListItem
from app.schemas.error import ErrorResponse
from app.schemas.homework_statistics import HomeworkStatisticsRequest, HomeworkStatisticsResponse
from app.schemas.lessons import LessonHistoryRequest, LessonHistoryResponse
from app.services.connections import ConnectionService
from app.services.homework_statistics import HomeworkStatisticsService
from app.services.lessons import LessonService

router = APIRouter(prefix="/teachers", tags=["Teachers"])


def get_homework_statistics_service(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> HomeworkStatisticsService:
    return HomeworkStatisticsService(session)


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
        bio=record.profile.bio,
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
    "/me/students/{student_id}/homework-statistics",
    response_model=HomeworkStatisticsResponse,
    summary="Get a student's homework statistics",
    description=(
        "Teacher-only statistics for an actively connected student. Homework created in the "
        "timezone-aware half-open period [date_from, date_to) forms the cohort. Submission "
        "and review history for that cohort is counted regardless of event date. Each metric "
        "counts unique Homework. submitted means any saved submission, reviewed means any saved "
        "accepted review, late means any submission saved as late after its deadline, and "
        "revision_required means any saved needs_revision review. completion_rate is "
        "round(reviewed / assigned * 100, 2), or null when assigned is zero."
    ),
    responses={
        403: {"model": ErrorResponse, "description": "Teacher role required"},
        404: {"model": ErrorResponse, "description": "Active connection not found"},
        422: {"model": ErrorResponse, "description": "Request validation failed"},
    },
)
async def get_student_homework_statistics(
    student_id: UUID,
    period: Annotated[HomeworkStatisticsRequest, Query()],
    teacher: Annotated[User, Depends(get_current_teacher)],
    service: Annotated[HomeworkStatisticsService, Depends(get_homework_statistics_service)],
) -> HomeworkStatisticsResponse:
    return await service.for_student(teacher, student_id, period)


@router.get(
    "/me/students/{student_id}/lesson-history",
    response_model=LessonHistoryResponse,
    summary="Get a student's lesson and attendance history",
    description=(
        "Teacher-only history for an actively connected student. The timezone-aware period "
        "is a half-open interval: date_from is inclusive and date_to is exclusive."
    ),
    responses={
        403: {"model": ErrorResponse, "description": "Teacher role required"},
        404: {"model": ErrorResponse, "description": "Active connection not found"},
        422: {"model": ErrorResponse, "description": "Request validation failed"},
    },
)
async def get_student_lesson_history(
    student_id: UUID,
    filters: Annotated[LessonHistoryRequest, Query()],
    teacher: Annotated[User, Depends(get_current_teacher)],
    service: Annotated[LessonService, Depends(get_lesson_service)],
) -> LessonHistoryResponse:
    return await service.student_history(teacher, student_id, filters, now=utc_now())


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
