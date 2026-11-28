"""Move lesson membership and attendance to participants without changing lesson IDs."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "20261128_0013"
down_revision = "20261110_0012"
branch_labels = None
depends_on = None

attendance_value = postgresql.ENUM("PRESENT", "ABSENT", name="attendance_value", create_type=False)
timestamp_check = (
    "(attendance IS NULL AND attendance_updated_at IS NULL) OR "
    "(attendance IS NOT NULL AND attendance_updated_at IS NOT NULL)"
)


def upgrade() -> None:
    # Freeze legacy writes for the entire transactional copy/verification/drop.
    op.execute("LOCK TABLE lessons IN ACCESS EXCLUSIVE MODE")
    op.create_table(
        "lesson_participants",
        sa.Column("lesson_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("attendance", attendance_value, nullable=True),
        sa.Column("attendance_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("lesson_id", "student_id", name="pk_lesson_participants"),
        sa.ForeignKeyConstraint(["lesson_id"], ["lessons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["student_id"], ["student_profiles.user_id"], ondelete="CASCADE"),
        sa.CheckConstraint(timestamp_check, name="ck_lesson_participants_attendance_timestamp"),
    )
    op.create_index("ix_lesson_participants_student_lesson", "lesson_participants", ["student_id", "lesson_id"])
    op.execute("""INSERT INTO lesson_participants (lesson_id, student_id, attendance, attendance_updated_at)
                  SELECT id, student_id, attendance, attendance_updated_at FROM lessons""")
    op.execute("""DO $$ BEGIN
        IF EXISTS (
            (SELECT id, student_id, attendance, attendance_updated_at FROM lessons
             EXCEPT SELECT lesson_id, student_id, attendance, attendance_updated_at FROM lesson_participants)
            UNION ALL
            (SELECT lesson_id, student_id, attendance, attendance_updated_at FROM lesson_participants
             EXCEPT SELECT id, student_id, attendance, attendance_updated_at FROM lessons)
        ) THEN RAISE EXCEPTION 'Lesson participant migration verification failed'; END IF;
    END $$""")
    op.drop_constraint("ck_lessons_attendance_timestamp", "lessons", type_="check")
    op.drop_index("ix_lessons_student_starts_at", table_name="lessons")
    op.drop_column("lessons", "student_id")
    op.drop_column("lessons", "attendance")
    op.drop_column("lessons", "attendance_updated_at")


def downgrade() -> None:
    op.execute("LOCK TABLE lessons, lesson_participants IN ACCESS EXCLUSIVE MODE")
    # Refuse BEFORE changing the schema, including malformed zero-participant rows.
    op.execute("""DO $$ BEGIN
        IF EXISTS (SELECT l.id FROM lessons l LEFT JOIN lesson_participants p ON p.lesson_id=l.id
                   GROUP BY l.id HAVING count(p.student_id) <> 1)
        THEN RAISE EXCEPTION 'Cannot downgrade: every lesson must have exactly one participant'; END IF;
    END $$""")
    op.add_column("lessons", sa.Column("student_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("lessons", sa.Column("attendance", attendance_value, nullable=True))
    op.add_column("lessons", sa.Column("attendance_updated_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("""UPDATE lessons l SET student_id=p.student_id, attendance=p.attendance,
                  attendance_updated_at=p.attendance_updated_at
                  FROM lesson_participants p WHERE p.lesson_id=l.id""")
    op.execute("""DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM lessons l JOIN lesson_participants p ON p.lesson_id=l.id
                   WHERE l.student_id IS DISTINCT FROM p.student_id
                      OR l.attendance IS DISTINCT FROM p.attendance
                      OR l.attendance_updated_at IS DISTINCT FROM p.attendance_updated_at)
        THEN RAISE EXCEPTION 'Lesson downgrade verification failed'; END IF;
    END $$""")
    op.alter_column("lessons", "student_id", nullable=False)
    op.create_foreign_key("fk_lessons_student_id_student_profiles", "lessons", "student_profiles",
                          ["student_id"], ["user_id"], ondelete="CASCADE")
    op.create_index("ix_lessons_student_starts_at", "lessons", ["student_id", "starts_at"])
    op.create_check_constraint("ck_lessons_attendance_timestamp", "lessons", timestamp_check)
    op.drop_table("lesson_participants")
