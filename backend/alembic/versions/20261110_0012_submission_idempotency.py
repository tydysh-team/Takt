"""Submission idempotency per homework.

Revision ID: 20261110_0012
Revises: 20261109_0011
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "20261110_0012"
down_revision = "20261109_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "homework_submissions",
        sa.Column("idempotency_key", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "homework_submissions", sa.Column("request_fingerprint", sa.String(64), nullable=True)
    )
    op.execute(
        "UPDATE homework_submissions SET idempotency_key = id, "
        "request_fingerprint = repeat('0', 64) WHERE idempotency_key IS NULL"
    )
    op.alter_column("homework_submissions", "idempotency_key", nullable=False)
    op.alter_column("homework_submissions", "request_fingerprint", nullable=False)
    op.create_unique_constraint(
        "uq_submission_homework_idempotency",
        "homework_submissions",
        ["homework_id", "idempotency_key"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_submission_homework_idempotency", "homework_submissions", type_="unique")
    op.drop_column("homework_submissions", "request_fingerprint")
    op.drop_column("homework_submissions", "idempotency_key")
