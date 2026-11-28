"""Real migration round trips in a rollback-only isolated schema of the test DB."""

import importlib.util
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import create_async_engine

from alembic.migration import MigrationContext
from alembic.operations import Operations
from conftest import require_test_database_url

pytestmark = [pytest.mark.asyncio, pytest.mark.postgresql]


@pytest.mark.parametrize("group", [False, True])
async def test_migration_preserves_data_and_refuses_lossy_downgrade(group):
    path = Path(__file__).parents[2] / "alembic/versions/20261128_0013_lesson_participants.py"
    spec = importlib.util.spec_from_file_location("participants_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_async_engine(require_test_database_url())
    schema = f"migration_test_{uuid4().hex}"
    try:
        async with engine.connect() as connection:
            async with connection.begin():
                await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
                await connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
                for statement in [
                    "CREATE TYPE attendance_value AS ENUM ('PRESENT', 'ABSENT')",
                    "CREATE TABLE student_profiles (user_id uuid PRIMARY KEY)",
                    """CREATE TABLE lessons (id uuid PRIMARY KEY, student_id uuid NOT NULL
                        REFERENCES student_profiles(user_id) ON DELETE CASCADE,
                        title text NOT NULL, starts_at timestamptz NOT NULL, duration_minutes int NOT NULL,
                        attendance attendance_value, attendance_updated_at timestamptz,
                        CONSTRAINT ck_lessons_attendance_timestamp CHECK (
                        (attendance IS NULL AND attendance_updated_at IS NULL) OR
                        (attendance IS NOT NULL AND attendance_updated_at IS NOT NULL)))""",
                    "CREATE INDEX ix_lessons_student_starts_at ON lessons(student_id, starts_at)",
                ]:
                    await connection.execute(text(statement))
                students = [uuid4() for _ in range(3)]
                for student in students:
                    await connection.execute(text("INSERT INTO student_profiles VALUES (:id)"), {"id": student})
                for index, value in enumerate(["PRESENT", "ABSENT", None]):
                    await connection.execute(text("""INSERT INTO lessons VALUES
                        (:id, :student, :title, '2030-01-01 10:00:00+04', 60,
                         CAST(:attendance AS attendance_value),
                         CASE WHEN :attendance IS NULL THEN NULL ELSE '2030-01-01 12:00:00+04'::timestamptz END)"""),
                        {"id": uuid4(), "student": students[index], "title": f"Existing {index}", "attendance": value})
                original = (await connection.execute(text("SELECT id, student_id, title, starts_at, duration_minutes, attendance, attendance_updated_at FROM lessons ORDER BY id"))).all()

                def invoke(sync_connection, name):
                    with Operations.context(MigrationContext.configure(sync_connection)):
                        getattr(migration, name)()

                await connection.run_sync(invoke, "upgrade")
                reconstructed = (await connection.execute(text("""SELECT l.id, p.student_id, l.title,
                    l.starts_at, l.duration_minutes, p.attendance, p.attendance_updated_at
                    FROM lessons l JOIN lesson_participants p ON p.lesson_id=l.id ORDER BY l.id"""))).all()
                assert reconstructed == original
                if group:
                    await connection.execute(text("INSERT INTO lesson_participants(lesson_id, student_id) VALUES (:lesson, :student)"),
                        {"lesson": original[0].id, "student": next(s for s in students if s != original[0].student_id)})
                    async with connection.begin_nested() as savepoint:
                        with pytest.raises(DBAPIError, match="exactly one participant"):
                            await connection.run_sync(invoke, "downgrade")
                        await savepoint.rollback()
                    assert await connection.scalar(text("SELECT count(*) FROM lesson_participants")) == 4
                    assert await connection.scalar(text("SELECT count(*) FROM lessons")) == 3
                else:
                    await connection.run_sync(invoke, "downgrade")
                    assert (await connection.execute(text("SELECT id, student_id, title, starts_at, duration_minutes, attendance, attendance_updated_at FROM lessons ORDER BY id"))).all() == original
                # Roll back the entire isolated schema, including its test-only enum.
                await connection.rollback()
    finally:
        await engine.dispose()
