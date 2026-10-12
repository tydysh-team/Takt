"""Collapse role memberships to one canonical account role.

Revision ID: 20261013_0005
Revises: 20261012_0004
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20261013_0005"
down_revision: str | None = "20261012_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

user_role = postgresql.ENUM(
    "ADMIN", "TEACHER", "STUDENT", name="user_role", create_type=False
)


def _check_single_role_and_profiles() -> None:
    bind = op.get_bind()
    wrong_count = bind.scalar(sa.text("""
        SELECT EXISTS (
            SELECT 1 FROM users u
            LEFT JOIN user_roles ur ON ur.user_id = u.id
            GROUP BY u.id HAVING count(ur.role_id) <> 1
        )
    """))
    if wrong_count:
        raise RuntimeError("Cannot collapse roles: every user must have exactly one role")

    inconsistent = bind.scalar(sa.text("""
        SELECT EXISTS (
            SELECT 1 FROM users u
            JOIN user_roles ur ON ur.user_id = u.id
            JOIN roles r ON r.id = ur.role_id
            LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
            LEFT JOIN student_profiles sp ON sp.user_id = u.id
            WHERE (r.code = 'TEACHER' AND (tp.user_id IS NULL OR sp.user_id IS NOT NULL))
               OR (r.code = 'STUDENT' AND (sp.user_id IS NULL OR tp.user_id IS NOT NULL))
               OR (r.code = 'ADMIN' AND (tp.user_id IS NOT NULL OR sp.user_id IS NOT NULL))
        )
    """))
    if inconsistent:
        raise RuntimeError("Cannot collapse roles: account role and domain profile disagree")


def upgrade() -> None:
    _check_single_role_and_profiles()
    bind = op.get_bind()
    user_role.create(bind, checkfirst=True)
    op.add_column("users", sa.Column("role", user_role, nullable=True))
    op.execute("""
        UPDATE users SET role = roles.code::user_role
        FROM user_roles JOIN roles ON roles.id = user_roles.role_id
        WHERE users.id = user_roles.user_id
    """)
    missing = bind.scalar(sa.text("SELECT EXISTS (SELECT 1 FROM users WHERE role IS NULL)"))
    if missing:
        raise RuntimeError("Cannot collapse roles: a user has no valid role code")
    op.alter_column("users", "role", nullable=False)
    op.alter_column("profiles", "timezone", server_default="Europe/Moscow")
    op.drop_table("user_roles")
    op.drop_table("roles")


def downgrade() -> None:
    op.create_table(
        "roles",
        sa.Column("id", sa.SmallInteger(), nullable=False),
        sa.Column("code", sa.String(length=7), nullable=False),
        sa.CheckConstraint("code IN ('ADMIN', 'TEACHER', 'STUDENT')", name="role_code"),
        sa.PrimaryKeyConstraint("id", name="pk_roles"),
        sa.UniqueConstraint("code", name="uq_roles_code"),
    )
    op.execute("INSERT INTO roles (id, code) VALUES (1, 'ADMIN'), (2, 'TEACHER'), (3, 'STUDENT')")
    op.create_table(
        "user_roles",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role_id", sa.SmallInteger(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_user_roles_user_id_users", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["role_id"], ["roles.id"], name="fk_user_roles_role_id_roles", ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("user_id", "role_id", name="pk_user_roles"),
    )
    op.execute("""
        INSERT INTO user_roles (user_id, role_id)
        SELECT users.id, roles.id FROM users JOIN roles ON users.role::text = roles.code
    """)
    op.alter_column("profiles", "timezone", server_default="UTC")
    op.drop_column("users", "role")
    user_role.drop(op.get_bind(), checkfirst=False)
