"""Add Epic 2 homework, attempts, reviews and attachment metadata.

Revision ID: 20261109_0011
Revises: 20261031_0010
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "20261109_0011"
down_revision = "20261031_0010"
branch_labels = None
depends_on = None

status_enum = postgresql.ENUM(
    "assigned", "submitted", "needs_revision", "reviewed", name="homework_status", create_type=False
)
decision_enum = postgresql.ENUM(
    "accepted", "needs_revision", name="homework_review_decision", create_type=False
)


def upgrade() -> None:
    status_enum.create(op.get_bind(), checkfirst=True)
    decision_enum.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "homework",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "teacher_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("teacher_profiles.user_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "student_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("student_profiles.user_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", status_enum, nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("idempotency_key", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("request_fingerprint", sa.String(64), nullable=False),
        sa.UniqueConstraint(
            "teacher_id", "idempotency_key", name="uq_homework_teacher_idempotency"
        ),
        sa.CheckConstraint("char_length(btrim(title)) > 0", name="ck_homework_title_not_empty"),
    )
    op.create_index("ix_homework_teacher_created", "homework", ["teacher_id", "created_at"])
    op.create_index("ix_homework_student_created", "homework", ["student_id", "created_at"])
    op.create_table(
        "homework_submissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "homework_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("homework.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("attempt_no", sa.Integer(), nullable=False),
        sa.Column("comment", sa.Text()),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_late", sa.Boolean(), nullable=False),
        sa.UniqueConstraint("homework_id", "attempt_no", name="uq_homework_attempt"),
        sa.CheckConstraint("attempt_no > 0", name="ck_homework_attempt_positive"),
    )
    op.create_index("ix_homework_submissions_homework", "homework_submissions", ["homework_id"])
    op.create_table(
        "homework_reviews",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "submission_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("homework_submissions.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("decision", decision_enum, nullable=False),
        sa.Column("grade", sa.Numeric()),
        sa.Column("comment", sa.Text()),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "homework_attachments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "homework_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("homework.id", ondelete="CASCADE"),
        ),
        sa.Column(
            "submission_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("homework_submissions.id", ondelete="CASCADE"),
        ),
        sa.Column("storage_key", sa.String(200), nullable=False),
        sa.Column("original_name", sa.String(255), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "(homework_id IS NULL) <> (submission_id IS NULL)",
            name="ck_homework_attachment_one_owner",
        ),
        sa.CheckConstraint(
            "size_bytes > 0 AND size_bytes <= 10485760", name="ck_homework_attachment_size"
        ),
        sa.UniqueConstraint("storage_key", name="uq_homework_attachment_storage_key"),
    )
    op.create_index("ix_homework_attachments_homework", "homework_attachments", ["homework_id"])
    op.create_index("ix_homework_attachments_submission", "homework_attachments", ["submission_id"])


def downgrade() -> None:
    op.drop_index("ix_homework_attachments_submission", table_name="homework_attachments")
    op.drop_index("ix_homework_attachments_homework", table_name="homework_attachments")
    op.drop_table("homework_attachments")
    op.drop_table("homework_reviews")
    op.drop_index("ix_homework_submissions_homework", table_name="homework_submissions")
    op.drop_table("homework_submissions")
    op.drop_index("ix_homework_student_created", table_name="homework")
    op.drop_index("ix_homework_teacher_created", table_name="homework")
    op.drop_table("homework")
    decision_enum.drop(op.get_bind(), checkfirst=True)
    status_enum.drop(op.get_bind(), checkfirst=True)
