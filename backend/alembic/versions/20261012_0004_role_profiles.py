"""Split account roles from users and introduce role-specific identities.

Revision ID: 20261012_0004
Revises: 20261009_0003
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20261012_0004"
down_revision: str | None = "20261009_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

legacy_role = postgresql.ENUM("ADMIN", "TEACHER", "STUDENT", name="user_role", create_type=False)


def _assert_integrity() -> None:
    bind = op.get_bind()
    invalid = bind.scalar(
        sa.text("""
        SELECT EXISTS (
            SELECT 1 FROM teacher_student_relations rel
            LEFT JOIN teacher_profiles tp ON tp.user_id = rel.teacher_id
            LEFT JOIN student_profiles sp ON sp.user_id = rel.student_id
            WHERE tp.user_id IS NULL OR sp.user_id IS NULL
            UNION ALL
            SELECT 1 FROM teacher_invitations inv
            LEFT JOIN teacher_profiles tp ON tp.user_id = inv.teacher_id
            LEFT JOIN student_profiles sp ON sp.user_id = inv.used_by_student_id
            WHERE tp.user_id IS NULL
               OR (inv.used_by_student_id IS NOT NULL AND sp.user_id IS NULL)
        )
    """)
    )
    if invalid:
        raise RuntimeError("Legacy relations/invitations contain users without matching roles")


def upgrade() -> None:
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
    op.create_table(
        "teacher_profiles",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_teacher_profiles_user_id_users", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", name="pk_teacher_profiles"),
    )
    op.create_table(
        "student_profiles",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_student_profiles_user_id_users", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", name="pk_student_profiles"),
    )
    op.execute("INSERT INTO teacher_profiles (user_id) SELECT id FROM users WHERE role = 'TEACHER'")
    op.execute("INSERT INTO student_profiles (user_id) SELECT id FROM users WHERE role = 'STUDENT'")

    op.add_column("profiles", sa.Column("middle_name", sa.String(length=100), nullable=True))
    op.create_check_constraint(
        "ck_profiles_middle_name_normalized",
        "profiles",
        "middle_name IS NULL OR (middle_name = btrim(middle_name) "
        "AND char_length(middle_name) > 0)",
    )
    op.drop_constraint("uq_profiles_user_id", "profiles", type_="unique")
    op.drop_constraint("pk_profiles", "profiles", type_="primary")
    op.drop_column("profiles", "id")
    op.create_primary_key("pk_profiles", "profiles", ["user_id"])

    _assert_integrity()
    for table, column, target, ondelete in (
        ("teacher_student_relations", "teacher_id", "teacher_profiles", "CASCADE"),
        ("teacher_student_relations", "student_id", "student_profiles", "CASCADE"),
        ("teacher_invitations", "teacher_id", "teacher_profiles", "CASCADE"),
        ("teacher_invitations", "used_by_student_id", "student_profiles", "RESTRICT"),
    ):
        old_name = f"fk_{table}_{column}_users"
        new_name = f"fk_{table}_{column}_{target}"
        op.drop_constraint(old_name, table, type_="foreignkey")
        op.create_foreign_key(new_name, table, target, [column], ["user_id"], ondelete=ondelete)

    missing_roles = op.get_bind().scalar(
        sa.text("""
        SELECT EXISTS (SELECT 1 FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id
                       WHERE ur.user_id IS NULL)
    """)
    )
    if missing_roles:
        raise RuntimeError("Could not migrate every user to user_roles")
    op.drop_column("users", "role")
    legacy_role.drop(op.get_bind(), checkfirst=False)


def downgrade() -> None:
    bind = op.get_bind()
    incompatible = bind.scalar(
        sa.text("""
        SELECT EXISTS (SELECT 1 FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id
                       GROUP BY u.id HAVING count(ur.role_id) <> 1)
    """)
    )
    if incompatible:
        raise RuntimeError("Cannot downgrade users with zero or multiple roles to users.role")
    inconsistent = bind.scalar(
        sa.text("""
        SELECT EXISTS (
            SELECT 1 FROM teacher_student_relations rel
            JOIN users u ON u.id = rel.teacher_id
            JOIN user_roles ur ON ur.user_id = u.id
            JOIN roles r ON r.id = ur.role_id WHERE r.code <> 'TEACHER'
            UNION ALL
            SELECT 1 FROM teacher_student_relations rel
            JOIN users u ON u.id = rel.student_id
            JOIN user_roles ur ON ur.user_id = u.id
            JOIN roles r ON r.id = ur.role_id WHERE r.code <> 'STUDENT'
        )
    """)
    )
    if inconsistent:
        raise RuntimeError("Cannot downgrade role-specific relations to a single-role schema")

    legacy_role.create(bind, checkfirst=True)
    op.add_column("users", sa.Column("role", legacy_role, nullable=True))
    op.execute("""
        UPDATE users SET role = roles.code::user_role
        FROM user_roles JOIN roles ON roles.id = user_roles.role_id
        WHERE users.id = user_roles.user_id
    """)
    op.alter_column("users", "role", nullable=False)

    for table, column, target, ondelete in (
        ("teacher_student_relations", "teacher_id", "teacher_profiles", "CASCADE"),
        ("teacher_student_relations", "student_id", "student_profiles", "CASCADE"),
        ("teacher_invitations", "teacher_id", "teacher_profiles", "CASCADE"),
        ("teacher_invitations", "used_by_student_id", "student_profiles", "RESTRICT"),
    ):
        op.drop_constraint(f"fk_{table}_{column}_{target}", table, type_="foreignkey")
        op.create_foreign_key(
            f"fk_{table}_{column}_users", table, "users", [column], ["id"], ondelete=ondelete
        )

    op.drop_constraint("pk_profiles", "profiles", type_="primary")
    op.add_column("profiles", sa.Column("id", postgresql.UUID(as_uuid=True), nullable=True))
    op.execute("UPDATE profiles SET id = gen_random_uuid()")
    op.alter_column("profiles", "id", nullable=False)
    op.create_primary_key("pk_profiles", "profiles", ["id"])
    op.create_unique_constraint("uq_profiles_user_id", "profiles", ["user_id"])
    op.drop_constraint("ck_profiles_middle_name_normalized", "profiles", type_="check")
    op.drop_column("profiles", "middle_name")
    op.drop_table("student_profiles")
    op.drop_table("teacher_profiles")
    op.drop_table("user_roles")
    op.drop_table("roles")
