"""Create lessons.

Revision ID: 20261017_0006
Revises: 20261013_0005
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20261017_0006"
down_revision: str | None = "20261013_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "lessons",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("teacher_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["teacher_id"],
            ["teacher_profiles.user_id"],
            name="fk_lessons_teacher_id_teacher_profiles",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["student_id"],
            ["student_profiles.user_id"],
            name="fk_lessons_student_id_student_profiles",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_lessons"),
    )
    op.create_index(
        "ix_lessons_teacher_starts_at", "lessons", ["teacher_id", "starts_at"], unique=False
    )
    op.create_index(
        "ix_lessons_student_starts_at", "lessons", ["student_id", "starts_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_lessons_student_starts_at", table_name="lessons")
    op.drop_index("ix_lessons_teacher_starts_at", table_name="lessons")
    op.drop_table("lessons")
