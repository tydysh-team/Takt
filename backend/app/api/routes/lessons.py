from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.api.dependencies.auth import (
    get_current_active_user,
    get_current_teacher,
    get_lesson_service,
)
from app.core.security import utc_now
from app.models.user import User
from app.schemas.error import ErrorResponse
from app.schemas.lessons import (
    LessonAttendanceUpdateRequest,
    LessonCancelRequest,
    LessonCreate,
    LessonDTO,
    LessonReadDTO,
    LessonRescheduleRequest,
    LessonSearchRequest,
    LessonSeriesCreate,
)
from app.services.lesson_views import lesson_record_to_dto, lesson_to_dto
from app.services.lessons import LessonService

router = APIRouter(prefix="/lessons", tags=["Lessons"])

lesson_errors: dict[int | str, dict[str, Any]] = {
    400: {"model": ErrorResponse, "description": "Lesson starts in the past"},
    403: {"model": ErrorResponse, "description": "Teacher role required"},
    404: {"model": ErrorResponse, "description": "Student is not available"},
    409: {"model": ErrorResponse, "description": "Lesson time conflict"},
    422: {"model": ErrorResponse, "description": "Request validation failed"},
}


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
    lesson = await service.create(teacher, payload)
    return lesson_to_dto(lesson, utc_now())


@router.post(
    "/series",
    response_model=list[LessonDTO],
    status_code=status.HTTP_201_CREATED,
    summary="Create a weekly lesson series",
    responses=lesson_errors,
)
async def create_lesson_series(
    payload: LessonSeriesCreate,
    teacher: Annotated[User, Depends(get_current_teacher)],
    service: Annotated[LessonService, Depends(get_lesson_service)],
) -> list[LessonDTO]:
    lessons = await service.create_series(teacher, payload)
    now = utc_now()
    return [lesson_to_dto(lesson, now) for lesson in lessons]


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
    records = await service.search(user, filters)
    now = utc_now()
    return [lesson_record_to_dto(record, now) for record in records]


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
    record = await service.get_by_id(user, lesson_id)
    return lesson_record_to_dto(record, utc_now())


@router.patch(
    "/{lesson_id}/schedule",
    response_model=LessonReadDTO,
    summary="Reschedule a planned lesson",
    responses={
        400: lesson_errors[400],
        403: lesson_errors[403],
        404: {"model": ErrorResponse, "description": "Lesson not found"},
        409: {"model": ErrorResponse, "description": "Conflict or invalid lesson state"},
        422: lesson_errors[422],
    },
)
async def reschedule_lesson(
    lesson_id: UUID,
    payload: LessonRescheduleRequest,
    teacher: Annotated[User, Depends(get_current_teacher)],
    service: Annotated[LessonService, Depends(get_lesson_service)],
) -> LessonReadDTO:
    record = await service.reschedule(teacher, lesson_id, payload)
    return lesson_record_to_dto(record, utc_now())


@router.post(
    "/{lesson_id}/cancel",
    response_model=LessonReadDTO,
    summary="Cancel a planned or in-progress lesson",
    responses={
        403: lesson_errors[403],
        404: {"model": ErrorResponse, "description": "Lesson not found"},
        409: {"model": ErrorResponse, "description": "Lesson cannot be cancelled"},
        422: lesson_errors[422],
    },
)
async def cancel_lesson(
    lesson_id: UUID,
    teacher: Annotated[User, Depends(get_current_teacher)],
    service: Annotated[LessonService, Depends(get_lesson_service)],
    payload: LessonCancelRequest | None = None,
) -> LessonReadDTO:
    record = await service.cancel(teacher, lesson_id, payload)
    return lesson_record_to_dto(record, utc_now())


@router.put(
    "/{lesson_id}/attendance",
    response_model=LessonReadDTO,
    summary="Set attendance for an in-progress or completed lesson",
    responses={
        401: {"model": ErrorResponse, "description": "Authentication required"},
        403: lesson_errors[403],
        404: {"model": ErrorResponse, "description": "Lesson not found"},
        409: {"model": ErrorResponse, "description": "Attendance is not available"},
        422: lesson_errors[422],
    },
)
async def update_lesson_attendance(
    lesson_id: UUID,
    payload: LessonAttendanceUpdateRequest,
    teacher: Annotated[User, Depends(get_current_teacher)],
    service: Annotated[LessonService, Depends(get_lesson_service)],
) -> LessonReadDTO:
    record = await service.update_attendance(teacher, lesson_id, payload)
    return lesson_record_to_dto(record, utc_now())
