from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class HomeworkStatus(StrEnum):
    ASSIGNED = "assigned"
    SUBMITTED = "submitted"
    NEEDS_REVISION = "needs_revision"
    REVIEWED = "reviewed"


class ReviewDecision(StrEnum):
    ACCEPTED = "accepted"
    NEEDS_REVISION = "needs_revision"


homework_status_type = Enum(
    HomeworkStatus,
    name="homework_status",
    values_callable=lambda enum: [value.value for value in enum],
)
review_decision_type = Enum(
    ReviewDecision,
    name="homework_review_decision",
    values_callable=lambda enum: [value.value for value in enum],
)


class Homework(Base):
    __tablename__ = "homework"
    __table_args__ = (
        Index("ix_homework_teacher_created", "teacher_id", "created_at"),
        Index("ix_homework_student_created", "student_id", "created_at"),
        UniqueConstraint("teacher_id", "idempotency_key", name="uq_homework_teacher_idempotency"),
        CheckConstraint("char_length(btrim(title)) > 0", name="ck_homework_title_not_empty"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
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
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[HomeworkStatus] = mapped_column(
        homework_status_type, nullable=False, default=HomeworkStatus.ASSIGNED
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    idempotency_key: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    attachments: Mapped[list["HomeworkAttachment"]] = relationship(
        back_populates="homework", foreign_keys="HomeworkAttachment.homework_id", lazy="selectin"
    )
    submissions: Mapped[list["HomeworkSubmission"]] = relationship(
        back_populates="homework", lazy="selectin"
    )


class HomeworkSubmission(Base):
    __tablename__ = "homework_submissions"
    __table_args__ = (
        UniqueConstraint("homework_id", "attempt_no", name="uq_homework_attempt"),
        CheckConstraint("attempt_no > 0", name="ck_homework_attempt_positive"),
        Index("ix_homework_submissions_homework", "homework_id"),
        UniqueConstraint(
            "homework_id", "idempotency_key", name="uq_submission_homework_idempotency"
        ),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    homework_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("homework.id", ondelete="CASCADE"), nullable=False
    )
    attempt_no: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_late: Mapped[bool] = mapped_column(nullable=False)
    idempotency_key: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    homework: Mapped[Homework] = relationship(back_populates="submissions")
    attachments: Mapped[list["HomeworkAttachment"]] = relationship(
        back_populates="submission",
        foreign_keys="HomeworkAttachment.submission_id",
        lazy="selectin",
    )


class HomeworkReview(Base):
    __tablename__ = "homework_reviews"

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    submission_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("homework_submissions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    decision: Mapped[ReviewDecision] = mapped_column(review_decision_type, nullable=False)
    grade: Mapped[Decimal | None] = mapped_column(Numeric)
    comment: Mapped[str | None] = mapped_column(Text)
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class HomeworkAttachment(Base):
    __tablename__ = "homework_attachments"
    __table_args__ = (
        CheckConstraint(
            "(homework_id IS NULL) <> (submission_id IS NULL)",
            name="ck_homework_attachment_one_owner",
        ),
        CheckConstraint(
            "size_bytes > 0 AND size_bytes <= 10485760", name="ck_homework_attachment_size"
        ),
        Index("ix_homework_attachments_homework", "homework_id"),
        Index("ix_homework_attachments_submission", "submission_id"),
        UniqueConstraint("storage_key", name="uq_homework_attachment_storage_key"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    homework_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("homework.id", ondelete="CASCADE")
    )
    submission_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("homework_submissions.id", ondelete="CASCADE")
    )
    storage_key: Mapped[str] = mapped_column(String(200), nullable=False)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    homework: Mapped[Homework | None] = relationship(
        back_populates="attachments", foreign_keys=[homework_id]
    )
    submission: Mapped[HomeworkSubmission | None] = relationship(
        back_populates="attachments", foreign_keys=[submission_id]
    )
