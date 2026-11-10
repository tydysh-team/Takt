from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.models.homework import Homework, HomeworkAttachment
from app.models.profile import Profile


@dataclass(frozen=True, slots=True)
class HomeworkRecord:
    homework: Homework
    teacher_profile: Profile
    student_profile: Profile


class HomeworkRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    def add(self, homework: Homework) -> None:
        self.session.add(homework)

    def add_attachment(self, attachment: HomeworkAttachment) -> None:
        self.session.add(attachment)

    async def by_idempotency_key(self, teacher_id: UUID, key: UUID) -> Homework | None:
        return await self.session.scalar(
            select(Homework).where(
                Homework.teacher_id == teacher_id, Homework.idempotency_key == key
            )
        )

    async def get(
        self, homework_id: UUID, *, teacher_id: UUID | None = None, student_id: UUID | None = None
    ) -> HomeworkRecord | None:
        teacher_profile = aliased(Profile)
        student_profile = aliased(Profile)
        statement = (
            select(Homework, teacher_profile, student_profile)
            .join(teacher_profile, teacher_profile.user_id == Homework.teacher_id)
            .join(student_profile, student_profile.user_id == Homework.student_id)
            .options(selectinload(Homework.attachments))
            .where(Homework.id == homework_id)
        )
        if teacher_id is not None:
            statement = statement.where(Homework.teacher_id == teacher_id)
        if student_id is not None:
            statement = statement.where(Homework.student_id == student_id)
        row = (await self.session.execute(statement)).one_or_none()
        return HomeworkRecord(row[0], row[1], row[2]) if row else None

    async def list_page(
        self,
        *,
        teacher_id: UUID | None = None,
        student_id: UUID | None = None,
        person_filter: UUID | None = None,
        limit: int,
        offset: int,
    ) -> tuple[list[HomeworkRecord], int]:
        conditions = []
        if teacher_id is not None:
            conditions.append(Homework.teacher_id == teacher_id)
            if person_filter is not None:
                conditions.append(Homework.student_id == person_filter)
        if student_id is not None:
            conditions.append(Homework.student_id == student_id)
            if person_filter is not None:
                conditions.append(Homework.teacher_id == person_filter)
        total = int(
            await self.session.scalar(select(func.count()).select_from(Homework).where(*conditions))
            or 0
        )
        teacher_profile = aliased(Profile)
        student_profile = aliased(Profile)
        statement = (
            select(Homework, teacher_profile, student_profile)
            .join(teacher_profile, teacher_profile.user_id == Homework.teacher_id)
            .join(student_profile, student_profile.user_id == Homework.student_id)
            .options(selectinload(Homework.attachments))
            .where(*conditions)
            .order_by(Homework.created_at.desc(), Homework.id.desc())
            .limit(limit)
            .offset(offset)
        )
        rows = (await self.session.execute(statement)).all()
        return [HomeworkRecord(row[0], row[1], row[2]) for row in rows], total
