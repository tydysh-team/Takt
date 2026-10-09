from asyncio import run
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import PasswordService, utc_now
from app.db.session import session_factory
from app.models.enums import RelationStatus, UserRole
from app.models.profile import Profile
from app.models.teacher_student_relation import TeacherStudentRelation
from app.models.user import User
from app.repositories.teacher_student_relations import TeacherStudentRelationRepository
from app.repositories.users import UserRepository

DEMO_PASSWORD = "TaktDemo!2026"


@dataclass(frozen=True, slots=True)
class DemoUser:
    email: str
    role: UserRole
    first_name: str
    last_name: str


DEMO_USERS = (
    DemoUser("admin@demo.example.com", UserRole.ADMIN, "Demo", "Administrator"),
    DemoUser("teacher@demo.example.com", UserRole.TEACHER, "Demo", "Teacher"),
    DemoUser("student1@demo.example.com", UserRole.STUDENT, "Alice", "Student"),
    DemoUser("student2@demo.example.com", UserRole.STUDENT, "Bob", "Student"),
    DemoUser("student3@demo.example.com", UserRole.STUDENT, "Carol", "Student"),
)


async def _ensure_user(
    session: AsyncSession,
    definition: DemoUser,
    passwords: PasswordService,
) -> User:
    users = UserRepository(session)
    user = await users.get_by_email(definition.email)
    if user is None:
        user = User(
            email=definition.email,
            password_hash=passwords.hash(DEMO_PASSWORD),
            role=definition.role,
            is_active=True,
        )
        user.profile = Profile(
            first_name=definition.first_name,
            last_name=definition.last_name,
            timezone="UTC",
        )
        users.add(user)
        await session.flush()
        return user
    if user.role != definition.role:
        raise RuntimeError(f"Demo user {definition.email} exists with a different role")
    if user.profile is None:
        user.profile = Profile(
            first_name=definition.first_name,
            last_name=definition.last_name,
            timezone="UTC",
        )
        await session.flush()
    return user


async def seed_development() -> None:
    settings = get_settings()
    if settings.app_env != "development":
        raise RuntimeError("Development seed is disabled outside APP_ENV=development")

    passwords = PasswordService()
    async with session_factory() as session:
        try:
            users = {
                definition.email: await _ensure_user(session, definition, passwords)
                for definition in DEMO_USERS
            }
            teacher = users["teacher@demo.example.com"]
            relations = TeacherStudentRelationRepository(session)
            now = utc_now()
            for student_email in (
                "student1@demo.example.com",
                "student2@demo.example.com",
                "student3@demo.example.com",
            ):
                student = users[student_email]
                relation = await relations.get_by_pair(
                    teacher.id,
                    student.id,
                    for_update=True,
                )
                if relation is None:
                    relations.add(
                        TeacherStudentRelation(
                            teacher_id=teacher.id,
                            student_id=student.id,
                            status=RelationStatus.ACTIVE,
                            created_at=now,
                        )
                    )
                elif relation.status == RelationStatus.INACTIVE:
                    relation.status = RelationStatus.ACTIVE
                    relation.deactivated_at = None
            await session.commit()
        except Exception:
            await session.rollback()
            raise


if __name__ == "__main__":
    run(seed_development())
