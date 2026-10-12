"""SQLAlchemy persistence models registered for Alembic metadata discovery."""

from app.models.enums import RelationStatus, RoleCode
from app.models.profile import Profile
from app.models.refresh_session import RefreshSession
from app.models.role_profiles import StudentProfile, TeacherProfile
from app.models.teacher_invitation import TeacherInvitation
from app.models.teacher_student_relation import TeacherStudentRelation
from app.models.user import User

__all__ = [
    "Profile",
    "RefreshSession",
    "RelationStatus",
    "RoleCode",
    "StudentProfile",
    "TeacherInvitation",
    "TeacherStudentRelation",
    "TeacherProfile",
    "User",
]

