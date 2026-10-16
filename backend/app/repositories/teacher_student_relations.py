from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import RelationStatus
from app.models.profile import Profile
from app.models.teacher_student_relation import TeacherStudentRelation
from app.models.user import User


@dataclass(frozen=True, slots=True)
class ConnectionRecord:
    relation: TeacherStudentRelation
    user: User
    profile: Profile


class TeacherStudentRelationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def add(self, relation: TeacherStudentRelation) -> None:
        self._session.add(relation)

    async def get_by_pair(
        self,
        teacher_id: UUID,
        student_id: UUID,
        *,
        for_update: bool = False,
    ) -> TeacherStudentRelation | None:
        statement = select(TeacherStudentRelation).where(
            TeacherStudentRelation.teacher_id == teacher_id,
            TeacherStudentRelation.student_id == student_id,
        )
        if for_update:
            statement = statement.with_for_update()
        return await self._session.scalar(statement)

    async def list_students(
        self,
        teacher_id: UUID,
        *,
        limit: int | None = None,
    ) -> list[ConnectionRecord]:
        statement = (
            select(TeacherStudentRelation, User, Profile)
            .join(User, User.id == TeacherStudentRelation.student_id)
            .join(Profile, Profile.user_id == User.id)
            .where(
                TeacherStudentRelation.teacher_id == teacher_id,
                TeacherStudentRelation.status == RelationStatus.ACTIVE,
                User.is_active.is_(True),
            )
            .order_by(TeacherStudentRelation.created_at.desc())
        )
        if limit is not None:
            statement = statement.limit(limit)
        rows = (await self._session.execute(statement)).all()
        return [ConnectionRecord(relation=row[0], user=row[1], profile=row[2]) for row in rows]

    async def get_student(
        self,
        teacher_id: UUID,
        student_id: UUID,
        *,
        for_update: bool = False,
    ) -> ConnectionRecord | None:
        statement = (
            select(TeacherStudentRelation, User, Profile)
            .join(User, User.id == TeacherStudentRelation.student_id)
            .join(Profile, Profile.user_id == User.id)
            .where(
                TeacherStudentRelation.teacher_id == teacher_id,
                TeacherStudentRelation.student_id == student_id,
                TeacherStudentRelation.status == RelationStatus.ACTIVE,
                User.is_active.is_(True),
            )
        )
        if for_update:
            statement = statement.with_for_update(of=TeacherStudentRelation)
        row = (await self._session.execute(statement)).one_or_none()
        if row is None:
            return None
        return ConnectionRecord(relation=row[0], user=row[1], profile=row[2])

    async def list_teachers(
        self,
        student_id: UUID,
        *,
        limit: int | None = None,
    ) -> list[ConnectionRecord]:
        statement = (
            select(TeacherStudentRelation, User, Profile)
            .join(User, User.id == TeacherStudentRelation.teacher_id)
            .join(Profile, Profile.user_id == User.id)
            .where(
                TeacherStudentRelation.student_id == student_id,
                TeacherStudentRelation.status == RelationStatus.ACTIVE,
                User.is_active.is_(True),
            )
            .order_by(TeacherStudentRelation.created_at.desc())
        )
        if limit is not None:
            statement = statement.limit(limit)
        rows = (await self._session.execute(statement)).all()
        return [ConnectionRecord(relation=row[0], user=row[1], profile=row[2]) for row in rows]

    async def get_teacher(self, student_id: UUID, teacher_id: UUID) -> ConnectionRecord | None:
        statement = (
            select(TeacherStudentRelation, User, Profile)
            .join(User, User.id == TeacherStudentRelation.teacher_id)
            .join(Profile, Profile.user_id == User.id)
            .where(
                TeacherStudentRelation.student_id == student_id,
                TeacherStudentRelation.teacher_id == teacher_id,
                TeacherStudentRelation.status == RelationStatus.ACTIVE,
                User.is_active.is_(True),
            )
        )
        row = (await self._session.execute(statement)).one_or_none()
        if row is None:
            return None
        return ConnectionRecord(relation=row[0], user=row[1], profile=row[2])

    async def count_students(self, teacher_id: UUID) -> int:
        statement = select(func.count()).select_from(TeacherStudentRelation).where(
            TeacherStudentRelation.teacher_id == teacher_id,
            TeacherStudentRelation.status == RelationStatus.ACTIVE,
        )
        return int(await self._session.scalar(statement) or 0)

    async def count_new_students(self, teacher_id: UUID, since: datetime) -> int:
        statement = select(func.count()).select_from(TeacherStudentRelation).where(
            TeacherStudentRelation.teacher_id == teacher_id,
            TeacherStudentRelation.status == RelationStatus.ACTIVE,
            TeacherStudentRelation.created_at >= since,
        )
        return int(await self._session.scalar(statement) or 0)

    async def count_teachers(self, student_id: UUID) -> int:
        statement = select(func.count()).select_from(TeacherStudentRelation).where(
            TeacherStudentRelation.student_id == student_id,
            TeacherStudentRelation.status == RelationStatus.ACTIVE,
        )
        return int(await self._session.scalar(statement) or 0)
