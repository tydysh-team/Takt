from typing import Annotated, Any

from fastapi import APIRouter, Depends, status

from app.api.dependencies.auth import get_current_teacher, get_lesson_service
from app.models.user import User
from app.schemas.error import ErrorResponse
from app.schemas.lessons import LessonCreate, LessonDTO
from app.services.lessons import LessonService

router = APIRouter(prefix="/lessons", tags=["Lessons"])

lesson_errors: dict[int | str, dict[str, Any]] = {
    400: {"model": ErrorResponse, "description": "Lesson starts in the past"},
    403: {"model": ErrorResponse, "description": "Teacher role required"},
    404: {"model": ErrorResponse, "description": "Student is not available"},
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
    return LessonDTO.model_validate(await service.create(teacher, payload))
