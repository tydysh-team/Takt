from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ProfileNotFoundError
from app.models.profile import Profile
from app.models.user import User
from app.repositories.profiles import ProfileRepository
from app.schemas.profile import ProfileUpdateRequest


class ProfileService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._profiles = ProfileRepository(session)

    async def get_for_user(self, user: User) -> Profile:
        if user.profile is not None:
            return user.profile
        profile = await self._profiles.get_by_user_id(user.id)
        if profile is None:
            raise ProfileNotFoundError()
        return profile

    async def update_for_user(self, user: User, payload: ProfileUpdateRequest) -> Profile:
        try:
            profile = await self._profiles.get_by_user_id(user.id, for_update=True)
            if profile is None:
                raise ProfileNotFoundError()
            changes = payload.model_dump(exclude_unset=True)
            for field_name, value in changes.items():
                setattr(profile, field_name, value)
            await self._session.commit()
        except ProfileNotFoundError:
            await self._session.rollback()
            raise
        except Exception:
            await self._session.rollback()
            raise
        return profile

