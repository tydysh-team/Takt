"""Add an optional cancellation reason to lessons.

Revision ID: 20261026_0009
Revises: 20261024_0008
"""

import sqlalchemy as sa

from alembic import op

revision = "20261026_0009"
down_revision = "20261024_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "lessons",
        sa.Column("cancellation_reason", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("lessons", "cancellation_reason")
