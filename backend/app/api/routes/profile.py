from typing import Annotated, Any

from fastapi import APIRouter, Depends

from app.api.dependencies.auth import get_current_active_user, get_profile_service
from app.models.profile import Profile
from app.models.user import User
from app.schemas.error import ErrorResponse
from app.schemas.profile import ProfileResponse, ProfileUpdateRequest
from app.services.profiles import ProfileService

router = APIRouter(prefix="/profile", tags=["Profile"])

profile_errors: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse, "description": "Authentication required"},
    403: {"model": ErrorResponse, "description": "User is inactive"},
    404: {"model": ErrorResponse, "description": "Profile not found"},
}


def _profile_response(user: User, profile: Profile) -> ProfileResponse:
    return ProfileResponse(
        first_name=profile.first_name,
        last_name=profile.last_name,
        middle_name=profile.middle_name,
        email=user.email,
        role=user.role,
        bio=profile.bio,
        timezone=profile.timezone,
    )


@router.get(
    "",
    response_model=ProfileResponse,
    summary="Get the current user's profile",
    description="Returns the editable profile and safe account identity fields.",
    responses=profile_errors,
)
async def get_profile(
    user: Annotated[User, Depends(get_current_active_user)],
    service: Annotated[ProfileService, Depends(get_profile_service)],
) -> ProfileResponse:
    profile = await service.get_for_user(user)
    return _profile_response(user, profile)


@router.patch(
    "",
    response_model=ProfileResponse,
    summary="Update the current user's profile",
    description="Updates only first_name, last_name, middle_name, bio, and timezone.",
    responses={
        **profile_errors,
        422: {"model": ErrorResponse, "description": "Request validation failed"},
    },
)
async def update_profile(
    payload: ProfileUpdateRequest,
    user: Annotated[User, Depends(get_current_active_user)],
    service: Annotated[ProfileService, Depends(get_profile_service)],
) -> ProfileResponse:
    profile = await service.update_for_user(user, payload)
    return _profile_response(user, profile)

