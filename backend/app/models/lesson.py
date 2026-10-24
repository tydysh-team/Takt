from datetime import datetime
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
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import AttendanceValue


class Lesson(Base):
    __tablename__ = "lessons"
    __table_args__ = (
        Index("ix_lessons_teacher_starts_at", "teacher_id", "starts_at"),
        Index("ix_lessons_student_starts_at", "student_id", "starts_at"),
        CheckConstraint("duration_minutes > 0", name="ck_lessons_duration_minutes_positive"),
        CheckConstraint(
            "(attendance IS NULL AND attendance_updated_at IS NULL) OR "
            "(attendance IS NOT NULL AND attendance_updated_at IS NOT NULL)",
            name="ck_lessons_attendance_timestamp",
        ),
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
    student_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("student_profiles.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rescheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    attendance: Mapped[AttendanceValue | None] = mapped_column(
        Enum(AttendanceValue, name="attendance_value", native_enum=True),
        nullable=True,
    )
    attendance_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
