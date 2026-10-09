"""Create teacher-student relations and invitations.

Revision ID: 20261009_0003
Revises: 20261008_0002
Create Date: 2026-10-09 00:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20261009_0003"
down_revision: str | None = "20261008_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

relation_status = postgresql.ENUM(
    "ACTIVE",
    "INACTIVE",
    name="relation_status",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    relation_status.create(bind, checkfirst=True)

    op.create_table(
        "teacher_student_relations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("teacher_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", relation_status, nullable=False),
        sa.Column("teacher_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "teacher_id <> student_id",
            name="ck_teacher_student_relations_distinct_users",
        ),
        sa.CheckConstraint(
            "teacher_note IS NULL OR char_length(teacher_note) <= 2000",
            name="ck_teacher_student_relations_note_length",
        ),
        sa.CheckConstraint(
            "(status = 'ACTIVE' AND deactivated_at IS NULL) OR "
            "(status = 'INACTIVE' AND deactivated_at IS NOT NULL)",
            name="ck_teacher_student_relations_status_timestamp",
        ),
        sa.ForeignKeyConstraint(
            ["teacher_id"],
            ["users.id"],
            name="fk_teacher_student_relations_teacher_id_users",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["student_id"],
            ["users.id"],
            name="fk_teacher_student_relations_student_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_teacher_student_relations"),
        sa.UniqueConstraint(
            "teacher_id",
            "student_id",
            name="uq_teacher_student_relations_pair",
        ),
    )
    op.create_index(
        "ix_teacher_student_relations_teacher_status",
        "teacher_student_relations",
        ["teacher_id", "status"],
        unique=False,
    )
    op.create_index(
        "ix_teacher_student_relations_student_status",
        "teacher_student_relations",
        ["student_id", "status"],
        unique=False,
    )

    op.create_table(
        "teacher_invitations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("teacher_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code_digest", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("used_by_student_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "expires_at > created_at",
            name="ck_teacher_invitations_expiry",
        ),
        sa.CheckConstraint(
            "(used_at IS NULL AND used_by_student_id IS NULL) OR "
            "(used_at IS NOT NULL AND used_by_student_id IS NOT NULL)",
            name="ck_teacher_invitations_usage",
        ),
        sa.ForeignKeyConstraint(
            ["teacher_id"],
            ["users.id"],
            name="fk_teacher_invitations_teacher_id_users",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["used_by_student_id"],
            ["users.id"],
            name="fk_teacher_invitations_used_by_student_id_users",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_teacher_invitations"),
        sa.UniqueConstraint("code_digest", name="uq_teacher_invitations_code_digest"),
    )
    op.create_index(
        "ix_teacher_invitations_teacher_id",
        "teacher_invitations",
        ["teacher_id"],
        unique=False,
    )
    op.create_index(
        "ix_teacher_invitations_expires_at",
        "teacher_invitations",
        ["expires_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_teacher_invitations_expires_at", table_name="teacher_invitations")
    op.drop_index("ix_teacher_invitations_teacher_id", table_name="teacher_invitations")
    op.drop_table("teacher_invitations")
    op.drop_index(
        "ix_teacher_student_relations_student_status",
        table_name="teacher_student_relations",
    )
    op.drop_index(
        "ix_teacher_student_relations_teacher_status",
        table_name="teacher_student_relations",
    )
    op.drop_table("teacher_student_relations")
    relation_status.drop(op.get_bind(), checkfirst=True)
