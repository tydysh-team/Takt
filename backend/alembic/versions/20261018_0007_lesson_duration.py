"""Add duration to lessons without changing existing start times.

Revision ID: 20261018_0007
Revises: 20261017_0006
"""

import sqlalchemy as sa

from alembic import op

revision = "20261018_0007"
down_revision = "20261017_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("lessons", sa.Column("duration_minutes", sa.Integer(), nullable=True))
    op.execute("UPDATE lessons SET duration_minutes = 60")
    op.alter_column("lessons", "duration_minutes", nullable=False)
    op.create_check_constraint(
        "ck_lessons_duration_minutes_positive", "lessons", "duration_minutes > 0"
    )


def downgrade() -> None:
    op.drop_constraint("ck_lessons_duration_minutes_positive", "lessons", type_="check")
    op.drop_column("lessons", "duration_minutes")
