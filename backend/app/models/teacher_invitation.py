from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TeacherInvitation(Base):
    __tablename__ = "teacher_invitations"
    __table_args__ = (
        UniqueConstraint("code_digest", name="uq_teacher_invitations_code_digest"),
        CheckConstraint("expires_at > created_at", name="ck_teacher_invitations_expiry"),
        CheckConstraint(
            "(used_at IS NULL AND used_by_student_id IS NULL) OR "
            "(used_at IS NOT NULL AND used_by_student_id IS NOT NULL)",
            name="ck_teacher_invitations_usage",
        ),
        Index("ix_teacher_invitations_teacher_id", "teacher_id"),
        Index("ix_teacher_invitations_expires_at", "expires_at"),
    )

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    teacher_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("teacher_profiles.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    code_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    used_by_student_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("student_profiles.user_id", ondelete="RESTRICT"),
        nullable=True,
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
