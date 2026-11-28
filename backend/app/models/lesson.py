from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import AttendanceValue

if TYPE_CHECKING:
    from app.models.profile import Profile


class Lesson(Base):
    __tablename__ = "lessons"
    __table_args__ = (
        Index("ix_lessons_teacher_starts_at", "teacher_id", "starts_at"),
        CheckConstraint("duration_minutes > 0", name="ck_lessons_duration_minutes_positive"),
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
    participants: Mapped[list["LessonParticipant"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin", order_by="LessonParticipant.student_id",
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancellation_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    rescheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )


class LessonParticipant(Base):
    __tablename__ = "lesson_participants"
    __table_args__ = (
        Index("ix_lesson_participants_student_lesson", "student_id", "lesson_id"),
        CheckConstraint(
            "(attendance IS NULL AND attendance_updated_at IS NULL) OR "
            "(attendance IS NOT NULL AND attendance_updated_at IS NOT NULL)",
            name="ck_lesson_participants_attendance_timestamp",
        ),
    )

    lesson_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("lessons.id", ondelete="CASCADE"),
        primary_key=True,
    )
    student_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("student_profiles.user_id", ondelete="CASCADE"),
        primary_key=True,
    )
    profile: Mapped["Profile"] = relationship(
        "Profile", primaryjoin="foreign(LessonParticipant.student_id) == Profile.user_id",
        viewonly=True, lazy="raise",
    )
    attendance: Mapped[AttendanceValue | None] = mapped_column(
        Enum(AttendanceValue, name="attendance_value", native_enum=True),
        nullable=True,
    )
    attendance_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
