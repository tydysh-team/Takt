from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.api.dependencies.auth import (
    get_current_active_user,
    get_current_teacher,
    get_lesson_service,
)
from app.models.user import User
from app.repositories.lessons import LessonRecord
from app.schemas.connections import StudentRefDTO
from app.schemas.error import ErrorResponse
from app.schemas.lessons import LessonCreate, LessonDTO, LessonReadDTO, LessonSearchRequest
from app.services.lessons import LessonService

router = APIRouter(prefix="/lessons", tags=["Lessons"])

lesson_errors: dict[int | str, dict[str, Any]] = {
    400: {"model": ErrorResponse, "description": "Lesson starts in the past"},
    403: {"model": ErrorResponse, "description": "Teacher role required"},
    404: {"model": ErrorResponse, "description": "Student is not available"},
    422: {"model": ErrorResponse, "description": "Request validation failed"},
}


def _read_dto(record: LessonRecord) -> LessonReadDTO:
    lesson = record.lesson
    return LessonReadDTO(
        id=lesson.id,
        title=lesson.title,
        description=lesson.description,
        starts_at=lesson.starts_at,
        duration_minutes=lesson.duration_minutes,
        teacher=StudentRefDTO(
            id=lesson.teacher_id,
            first_name=record.teacher_profile.first_name,
            last_name=record.teacher_profile.last_name,
            middle_name=record.teacher_profile.middle_name,
        ),
        student=StudentRefDTO(
            id=lesson.student_id,
            first_name=record.student_profile.first_name,
            last_name=record.student_profile.last_name,
            middle_name=record.student_profile.middle_name,
        ),
    )


@router.post(
    "",
    response_model=LessonDTO,
    status_code=status.HTTP_201_CREATED,
    summary="Create a lesson",
    responses=lesson_errors,
)
async def create_lesson(
    payload: LessonCreate,
    teacher: Annotated[User, Depends(get_current_teacher)],
    service: Annotated[LessonService, Depends(get_lesson_service)],
) -> LessonDTO:
    return LessonDTO.model_validate(await service.create(teacher, payload))


@router.post(
    "/search",
    response_model=list[LessonReadDTO],
    summary="Search accessible lessons",
    responses={422: lesson_errors[422]},
)
async def search_lessons(
    filters: LessonSearchRequest,
    user: Annotated[User, Depends(get_current_active_user)],
    service: Annotated[LessonService, Depends(get_lesson_service)],
) -> list[LessonReadDTO]:
    return [_read_dto(record) for record in await service.search(user, filters)]


@router.get(
    "/{lesson_id}",
    response_model=LessonReadDTO,
    summary="Get an accessible lesson",
    responses={404: {"model": ErrorResponse, "description": "Lesson not found"}},
)
async def get_lesson(
    lesson_id: UUID,
    user: Annotated[User, Depends(get_current_active_user)],
    service: Annotated[LessonService, Depends(get_lesson_service)],
) -> LessonReadDTO:
    return _read_dto(await service.get_by_id(user, lesson_id))
