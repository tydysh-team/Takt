from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConnectionNotFoundError, ForbiddenError
from app.models.enums import RoleCode
from app.models.user import User
from app.repositories.teacher_student_relations import (
    ConnectionRecord,
    TeacherStudentRelationRepository,
)


class ConnectionService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._relations = TeacherStudentRelationRepository(session)

    async def list_students(self, teacher: User) -> list[ConnectionRecord]:
        self._ensure_role(teacher, RoleCode.TEACHER)
        return await self._relations.list_students(teacher.id)

    async def get_student(self, teacher: User, student_id: UUID) -> ConnectionRecord:
        self._ensure_role(teacher, RoleCode.TEACHER)
        record = await self._relations.get_student(teacher.id, student_id)
        if record is None:
            raise ConnectionNotFoundError()
        return record

    async def update_teacher_note(
        self,
        teacher: User,
        student_id: UUID,
        note: str | None,
    ) -> ConnectionRecord:
        self._ensure_role(teacher, RoleCode.TEACHER)
        try:
            record = await self._relations.get_student(
                teacher.id,
                student_id,
                for_update=True,
            )
            if record is None:
                raise ConnectionNotFoundError()
            record.relation.teacher_note = note
            await self._session.commit()
        except ConnectionNotFoundError:
            await self._session.rollback()
            raise
        except Exception:
            await self._session.rollback()
            raise
        return record

    async def list_teachers(self, student: User) -> list[ConnectionRecord]:
        self._ensure_role(student, RoleCode.STUDENT)
        return await self._relations.list_teachers(student.id)

    async def get_teacher(self, student: User, teacher_id: UUID) -> ConnectionRecord:
        self._ensure_role(student, RoleCode.STUDENT)
        record = await self._relations.get_teacher(student.id, teacher_id)
        if record is None:
            raise ConnectionNotFoundError()
        return record

    @staticmethod
    def _ensure_role(user: User, expected: RoleCode) -> None:
        if user.role != expected or not user.is_active:
            raise ForbiddenError()
