from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import Boolean, CheckConstraint, DateTime, Enum, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import RoleCode
from app.models.mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.profile import Profile
    from app.models.refresh_session import RefreshSession
    from app.models.role_profiles import StudentProfile, TeacherProfile


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("email = lower(btrim(email))", name="ck_users_email_normalized"),
        UniqueConstraint("email", name="uq_users_email"),
    )

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[RoleCode] = mapped_column(
        Enum(RoleCode, name="user_role", native_enum=True), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    profile: Mapped["Profile | None"] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        single_parent=True,
        uselist=False,
    )
    teacher_profile: Mapped["TeacherProfile | None"] = relationship(
        back_populates="user", cascade="all, delete-orphan", uselist=False
    )
    student_profile: Mapped["StudentProfile | None"] = relationship(
        back_populates="user", cascade="all, delete-orphan", uselist=False
    )
    refresh_sessions: Mapped[list["RefreshSession"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
