from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Index, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import RelationStatus


class TeacherStudentRelation(Base):
    __tablename__ = "teacher_student_relations"
    __table_args__ = (
        UniqueConstraint(
            "teacher_id",
            "student_id",
            name="uq_teacher_student_relations_pair",
        ),
        CheckConstraint(
            "teacher_id <> student_id",
            name="ck_teacher_student_relations_distinct_users",
        ),
        CheckConstraint(
            "teacher_note IS NULL OR char_length(teacher_note) <= 2000",
            name="ck_teacher_student_relations_note_length",
        ),
        CheckConstraint(
            "(status = 'ACTIVE' AND deactivated_at IS NULL) OR "
            "(status = 'INACTIVE' AND deactivated_at IS NOT NULL)",
            name="ck_teacher_student_relations_status_timestamp",
        ),
        Index("ix_teacher_student_relations_teacher_status", "teacher_id", "status"),
        Index("ix_teacher_student_relations_student_status", "student_id", "status"),
    )

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    teacher_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    student_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[RelationStatus] = mapped_column(
        Enum(RelationStatus, name="relation_status", native_enum=True),
        nullable=False,
        default=RelationStatus.ACTIVE,
    )
    teacher_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    deactivated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
