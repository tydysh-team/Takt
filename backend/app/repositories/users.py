from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.user import User


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_email(self, email: str, *, for_update: bool = False) -> User | None:
        statement = (
            select(User)
            .where(User.email == email)
            .options(selectinload(User.profile))
        )
        if for_update:
            statement = statement.with_for_update()
        return await self._session.scalar(statement)

    async def get_by_id(self, user_id: UUID, *, for_update: bool = False) -> User | None:
        statement = (
            select(User)
            .where(User.id == user_id)
            .options(selectinload(User.profile))
        )
        if for_update:
            statement = statement.with_for_update()
        return await self._session.scalar(statement)

    def add(self, user: User) -> None:
        self._session.add(user)
