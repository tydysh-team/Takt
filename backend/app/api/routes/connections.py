from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.api.dependencies.auth import (
    enforce_rate_limit,
    get_current_student,
    get_invitation_service,
    get_rate_limiter,
)
from app.core.config import Settings, get_settings
from app.core.rate_limit import RateLimiter
from app.models.user import User
from app.schemas.connections import ConnectionAcceptedResponse, TeacherListItem
from app.schemas.error import ErrorResponse
from app.schemas.invitations import InvitationAcceptRequest
from app.services.invitations import InvitationService

router = APIRouter(prefix="/connections", tags=["Connections"])


@router.post(
    "/accept",
    response_model=ConnectionAcceptedResponse,
    summary="Accept a teacher invitation",
    description="Atomically redeems a one-time invitation for the current student.",
    responses={
        400: {"model": ErrorResponse, "description": "Invitation is invalid or inactive"},
        403: {"model": ErrorResponse, "description": "Student role required"},
        409: {"model": ErrorResponse, "description": "Student is already connected"},
        429: {"model": ErrorResponse, "description": "Rate limit exceeded"},
    },
)
async def accept_invitation(
    payload: InvitationAcceptRequest,
    request: Request,
    student: Annotated[User, Depends(get_current_student)],
    service: Annotated[InvitationService, Depends(get_invitation_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    limiter: Annotated[RateLimiter, Depends(get_rate_limiter)],
) -> ConnectionAcceptedResponse:
    await enforce_rate_limit(
        request=request,
        scope="connections:accept",
        limit=settings.invitation_accept_rate_limit,
        settings=settings,
        limiter=limiter,
    )
    result = await service.accept(student, payload.code)
    return ConnectionAcceptedResponse(
        teacher=TeacherListItem(
            id=result.teacher.id,
            first_name=result.teacher_profile.first_name,
            last_name=result.teacher_profile.last_name,
            email=result.teacher.email,
            timezone=result.teacher_profile.timezone,
            connected_at=result.relation.created_at,
        )
    )
