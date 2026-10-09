from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.teacher_invitation import TeacherInvitation


class TeacherInvitationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def add(self, invitation: TeacherInvitation) -> None:
        self._session.add(invitation)

    async def list_for_teacher(self, teacher_id: UUID) -> list[TeacherInvitation]:
        statement = (
            select(TeacherInvitation)
            .where(TeacherInvitation.teacher_id == teacher_id)
            .order_by(TeacherInvitation.created_at.desc())
        )
        return list((await self._session.scalars(statement)).all())

    async def get_owned_by_id(
        self,
        invitation_id: UUID,
        teacher_id: UUID,
        *,
        for_update: bool = False,
    ) -> TeacherInvitation | None:
        statement = select(TeacherInvitation).where(
            TeacherInvitation.id == invitation_id,
            TeacherInvitation.teacher_id == teacher_id,
        )
        if for_update:
            statement = statement.with_for_update()
        return await self._session.scalar(statement)

    async def get_by_digest_for_update(self, code_digest: str) -> TeacherInvitation | None:
        statement = (
            select(TeacherInvitation)
            .where(TeacherInvitation.code_digest == code_digest)
            .with_for_update()
        )
        return await self._session.scalar(statement)

    async def count_active_for_teacher(self, teacher_id: UUID, now: datetime) -> int:
        statement = select(func.count()).select_from(TeacherInvitation).where(
            TeacherInvitation.teacher_id == teacher_id,
            TeacherInvitation.used_at.is_(None),
            TeacherInvitation.revoked_at.is_(None),
            TeacherInvitation.expires_at > now,
        )
        return int(await self._session.scalar(statement) or 0)
