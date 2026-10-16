from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.models.enums import RoleCode
from app.schemas.connections import StudentListItem, TeacherListItem


class TeacherDashboardResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal[RoleCode.TEACHER] = RoleCode.TEACHER
    students_count: int
    new_students_30d: int
    active_invitations_count: int
    recent_students: list[StudentListItem]


class StudentDashboardResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal[RoleCode.STUDENT] = RoleCode.STUDENT
    teachers_count: int
    recent_teachers: list[TeacherListItem]
