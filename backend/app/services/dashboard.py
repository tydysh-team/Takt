from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError
from app.core.security import utc_now
from app.models.enums import RoleCode
from app.models.user import User
from app.repositories.teacher_invitations import TeacherInvitationRepository
from app.repositories.teacher_student_relations import (
    ConnectionRecord,
    TeacherStudentRelationRepository,
)


@dataclass(frozen=True, slots=True)
class TeacherDashboard:
    students_count: int
    new_students_30d: int
    active_invitations_count: int
    recent_students: list[ConnectionRecord]


@dataclass(frozen=True, slots=True)
class StudentDashboard:
    teachers_count: int
    recent_teachers: list[ConnectionRecord]


class DashboardService:
    def __init__(self, session: AsyncSession) -> None:
        self._relations = TeacherStudentRelationRepository(session)
        self._invitations = TeacherInvitationRepository(session)

    async def summary(self, user: User) -> TeacherDashboard | StudentDashboard:
        now = utc_now()
        if user.role == RoleCode.TEACHER:
            return TeacherDashboard(
                students_count=await self._relations.count_students(user.id),
                new_students_30d=await self._relations.count_new_students(
                    user.id,
                    now - timedelta(days=30),
                ),
                active_invitations_count=await self._invitations.count_active_for_teacher(
                    user.id,
                    now,
                ),
                recent_students=await self._relations.list_students(user.id, limit=5),
            )
        if user.role == RoleCode.STUDENT:
            return StudentDashboard(
                teachers_count=await self._relations.count_teachers(user.id),
                recent_teachers=await self._relations.list_teachers(user.id, limit=5),
            )
        raise ForbiddenError(message="Панель недоступна для этой роли.")
