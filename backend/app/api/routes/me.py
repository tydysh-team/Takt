from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.dependencies.auth import get_current_active_user
from app.core.exceptions import ProfileNotFoundError
from app.models.user import User
from app.schemas.auth import CurrentUserResponse
from app.schemas.error import ErrorResponse

router = APIRouter(tags=["Authentication"])


@router.get(
    "/me",
    response_model=CurrentUserResponse,
    summary="Get the current authenticated user",
    description="Resolves the current active user from a validated Bearer access JWT.",
    responses={
        401: {"model": ErrorResponse, "description": "Authentication required"},
        403: {"model": ErrorResponse, "description": "User is inactive"},
    },
)
async def current_user(
    user: Annotated[User, Depends(get_current_active_user)],
) -> CurrentUserResponse:
    if user.profile is None:
        raise ProfileNotFoundError()
    return CurrentUserResponse(
        id=user.id,
        email=user.email,
        role=user.role,
        first_name=user.profile.first_name,
        last_name=user.profile.last_name,
        middle_name=user.profile.middle_name,
    )
