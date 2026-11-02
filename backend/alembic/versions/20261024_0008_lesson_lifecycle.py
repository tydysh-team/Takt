"""Add stored lesson lifecycle facts and attendance.

Revision ID: 20261024_0008
Revises: 20261018_0007
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "20261024_0008"
down_revision = "20261018_0007"
branch_labels = None
depends_on = None

attendance_value = postgresql.ENUM(
    "PRESENT",
    "ABSENT",
    name="attendance_value",
    create_type=False,
)


def upgrade() -> None:
    attendance_value.create(op.get_bind(), checkfirst=True)
    op.add_column("lessons", sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("lessons", sa.Column("rescheduled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("lessons", sa.Column("attendance", attendance_value, nullable=True))
    op.add_column(
        "lessons", sa.Column("attendance_updated_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_check_constraint(
        "ck_lessons_attendance_timestamp",
        "lessons",
        "(attendance IS NULL AND attendance_updated_at IS NULL) OR "
        "(attendance IS NOT NULL AND attendance_updated_at IS NOT NULL)",
    )


def downgrade() -> None:
    op.drop_constraint("ck_lessons_attendance_timestamp", "lessons", type_="check")
    op.drop_column("lessons", "attendance_updated_at")
    op.drop_column("lessons", "attendance")
    op.drop_column("lessons", "rescheduled_at")
    op.drop_column("lessons", "cancelled_at")
    attendance_value.drop(op.get_bind(), checkfirst=True)
