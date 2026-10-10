from uuid import UUID

from fastapi import FastAPI
from sqladmin import Admin, ModelView
from sqladmin.authentication import AuthenticationBackend
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.requests import Request

from app.core.config import get_settings
from app.core.security import PasswordService
from app.db.session import engine, session_factory
from app.models.enums import UserRole
from app.models.profile import Profile
from app.models.refresh_session import RefreshSession
from app.models.teacher_invitation import TeacherInvitation
from app.models.teacher_student_relation import TeacherStudentRelation
from app.models.user import User


class AdminAuthentication(AuthenticationBackend):
    def __init__(
        self,
        *,
        secret_key: str,
        sessions: async_sessionmaker[AsyncSession],
        passwords: PasswordService,
        secure_cookie: bool,
    ) -> None:
        super().__init__(
            secret_key=secret_key,
            session_cookie="takt_admin",
            max_age=8 * 60 * 60,
            same_site="lax",
            https_only=secure_cookie,
        )
        self._sessions = sessions
        self._passwords = passwords

    def set_session_factory(self, sessions: async_sessionmaker[AsyncSession]) -> None:
        """Allow PostgreSQL tests to share their rollback-only connection."""
        self._sessions = sessions

    async def login(self, request: Request) -> bool:
        form = await request.form()
        email = str(form.get("username", "")).strip().lower()
        password = str(form.get("password", ""))
        async with self._sessions() as session:
            user = await session.scalar(select(User).where(User.email == email))
            if user is None:
                self._passwords.verify_dummy(password)
                return False
            if (
                not self._passwords.verify(user.password_hash, password)
                or not user.is_active
                or user.role != UserRole.ADMIN
            ):
                return False
            if self._passwords.needs_rehash(user.password_hash):
                user.password_hash = self._passwords.hash(password)
                await session.commit()
            request.session.clear()
            request.session["user_id"] = str(user.id)
            return True

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool:
        raw_user_id = request.session.get("user_id")
        if not isinstance(raw_user_id, str):
            return False
        try:
            user_id = UUID(raw_user_id)
        except ValueError:
            request.session.clear()
            return False
        async with self._sessions() as session:
            user = await session.scalar(select(User).where(User.id == user_id))
            authenticated = bool(
                user is not None and user.is_active and user.role == UserRole.ADMIN
            )
        if not authenticated:
            request.session.clear()
        return authenticated


class UserAdmin(ModelView, model=User):
    name = "User"
    name_plural = "Users"
    can_create = False
    column_list = [
        User.id,
        User.email,
        User.role,
        User.is_active,
        User.email_verified_at,
        User.created_at,
        User.updated_at,
    ]
    column_details_list = column_list
    form_columns = [User.email, User.role, User.is_active, User.email_verified_at]


class ProfileAdmin(ModelView, model=Profile):
    name = "Profile"
    name_plural = "Profiles"
    can_create = False
    column_list = [
        Profile.id,
        Profile.user_id,
        Profile.first_name,
        Profile.last_name,
        Profile.timezone,
        Profile.created_at,
        Profile.updated_at,
    ]
    column_details_list = [*column_list, Profile.bio]
    form_columns = [Profile.first_name, Profile.last_name, Profile.bio, Profile.timezone]


class RelationAdmin(ModelView, model=TeacherStudentRelation):
    name = "Teacher-student relation"
    name_plural = "Teacher-student relations"
    can_create = False
    column_list = [
        TeacherStudentRelation.id,
        TeacherStudentRelation.teacher_id,
        TeacherStudentRelation.student_id,
        TeacherStudentRelation.status,
        TeacherStudentRelation.created_at,
        TeacherStudentRelation.deactivated_at,
    ]
    column_details_list = [*column_list, TeacherStudentRelation.teacher_note]
    form_columns = [TeacherStudentRelation.teacher_note]


class InvitationAdmin(ModelView, model=TeacherInvitation):
    name = "Teacher invitation"
    name_plural = "Teacher invitations"
    can_create = False
    can_edit = False
    column_list = [
        TeacherInvitation.id,
        TeacherInvitation.teacher_id,
        TeacherInvitation.created_at,
        TeacherInvitation.expires_at,
        TeacherInvitation.used_at,
        TeacherInvitation.used_by_student_id,
        TeacherInvitation.revoked_at,
    ]
    column_details_list = column_list


class RefreshSessionAdmin(ModelView, model=RefreshSession):
    name = "Refresh session"
    name_plural = "Refresh sessions"
    can_create = False
    can_edit = False
    column_list = [
        RefreshSession.id,
        RefreshSession.user_id,
        RefreshSession.family_id,
        RefreshSession.created_at,
        RefreshSession.last_used_at,
        RefreshSession.expires_at,
        RefreshSession.revoked_at,
    ]
    column_details_list = column_list


settings = get_settings()
admin_authentication = AdminAuthentication(
    secret_key=settings.admin_session_secret.get_secret_value(),
    sessions=session_factory,
    passwords=PasswordService(),
    secure_cookie=settings.secure_cookies,
)


def setup_admin(app: FastAPI) -> Admin:
    admin = Admin(
        app,
        engine,
        title="Takt Administration",
        base_url="/admin",
        authentication_backend=admin_authentication,
    )
    for view in (
        UserAdmin,
        ProfileAdmin,
        RelationAdmin,
        InvitationAdmin,
        RefreshSessionAdmin,
    ):
        admin.add_view(view)
    return admin
