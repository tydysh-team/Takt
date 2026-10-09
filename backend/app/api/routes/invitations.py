from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status

from app.api.dependencies.auth import get_current_teacher, get_invitation_service
from app.models.user import User
from app.schemas.error import ErrorResponse
from app.schemas.invitations import InvitationCreateResponse, InvitationListItem
from app.services.invitations import InvitationService

router = APIRouter(prefix="/invitations", tags=["Invitations"])


@router.post(
    "",
    response_model=InvitationCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a teacher invitation",
    description="Creates a seven-day, one-time invitation. Only this response contains the code.",
    responses={403: {"model": ErrorResponse, "description": "Teacher role required"}},
)
async def create_invitation(
    teacher: Annotated[User, Depends(get_current_teacher)],
    service: Annotated[InvitationService, Depends(get_invitation_service)],
) -> InvitationCreateResponse:
    result = await service.create(teacher)
    return InvitationCreateResponse(
        id=result.invitation.id,
        code=result.raw_code,
        created_at=result.invitation.created_at,
        expires_at=result.invitation.expires_at,
    )


@router.get(
    "",
    response_model=list[InvitationListItem],
    summary="List the current teacher's invitations",
    description="Returns invitation metadata and derived status without codes or digests.",
    responses={403: {"model": ErrorResponse, "description": "Teacher role required"}},
)
async def list_invitations(
    teacher: Annotated[User, Depends(get_current_teacher)],
    service: Annotated[InvitationService, Depends(get_invitation_service)],
) -> list[InvitationListItem]:
    records = await service.list_for_teacher(teacher)
    return [
        InvitationListItem(
            id=record.invitation.id,
            created_at=record.invitation.created_at,
            expires_at=record.invitation.expires_at,
            used_at=record.invitation.used_at,
            revoked_at=record.invitation.revoked_at,
            status=record.status,
        )
        for record in records
    ]


@router.post(
    "/{invitation_id}/revoke",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke an invitation",
    description=(
        "Revokes an unused invitation owned by the current teacher. Repeated revoke is safe."
    ),
    responses={
        403: {"model": ErrorResponse, "description": "Teacher role required"},
        404: {"model": ErrorResponse, "description": "Invitation not found"},
        409: {"model": ErrorResponse, "description": "Invitation is no longer active"},
    },
)
async def revoke_invitation(
    invitation_id: UUID,
    teacher: Annotated[User, Depends(get_current_teacher)],
    service: Annotated[InvitationService, Depends(get_invitation_service)],
) -> Response:
    await service.revoke(teacher, invitation_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
