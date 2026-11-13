from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.models.homework import (
    Homework,
    HomeworkAttachment,
    HomeworkReview,
    HomeworkStatus,
    HomeworkSubmission,
)
from app.models.profile import Profile


@dataclass(frozen=True, slots=True)
class HomeworkRecord:
    homework: Homework
    teacher_profile: Profile
    student_profile: Profile


@dataclass(frozen=True, slots=True)
class SubmissionRecord:
    submission: HomeworkSubmission
    homework: Homework
    student_profile: Profile


class HomeworkRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    def add(self, homework: Homework) -> None:
        self.session.add(homework)

    def add_attachment(self, attachment: HomeworkAttachment) -> None:
        self.session.add(attachment)

    def add_submission(self, submission: HomeworkSubmission) -> None:
        self.session.add(submission)

    def add_review(self, review: HomeworkReview) -> None:
        self.session.add(review)

    async def lock_for_review(self, submission_id: UUID, teacher_id: UUID) -> Homework | None:
        homework_id = await self.session.scalar(
            select(HomeworkSubmission.homework_id).where(HomeworkSubmission.id == submission_id)
        )
        if homework_id is None:
            return None
        return await self.session.scalar(
            select(Homework)
            .where(Homework.id == homework_id, Homework.teacher_id == teacher_id)
            .with_for_update(of=Homework)
        )

    async def latest_submission(self, homework_id: UUID) -> HomeworkSubmission | None:
        return await self.session.scalar(
            select(HomeworkSubmission)
            .where(HomeworkSubmission.homework_id == homework_id)
            .order_by(HomeworkSubmission.attempt_no.desc())
            .limit(1)
        )

    async def history(self, homework_id: UUID) -> list[HomeworkSubmission]:
        return list(
            (await self.session.scalars(
                select(HomeworkSubmission)
                .options(
                    selectinload(HomeworkSubmission.attachments),
                    selectinload(HomeworkSubmission.review),
                )
                .where(HomeworkSubmission.homework_id == homework_id)
                .order_by(HomeworkSubmission.attempt_no.asc())
            )).all()
        )

    async def lock_for_submission(self, homework_id: UUID, student_id: UUID) -> Homework | None:
        return await self.session.scalar(
            select(Homework)
            .where(Homework.id == homework_id, Homework.student_id == student_id)
            .with_for_update(of=Homework)
        )

    async def submission_by_key(self, homework_id: UUID, key: UUID) -> HomeworkSubmission | None:
        return await self.session.scalar(
            select(HomeworkSubmission).where(
                HomeworkSubmission.homework_id == homework_id,
                HomeworkSubmission.idempotency_key == key,
            )
        )

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

    async def pending_page(
        self, teacher_id: UUID, limit: int, offset: int
    ) -> tuple[list[SubmissionRecord], int]:
        latest = (
            select(
                HomeworkSubmission.homework_id,
                func.max(HomeworkSubmission.attempt_no).label("attempt_no"),
            )
            .group_by(HomeworkSubmission.homework_id)
            .subquery()
        )
        conditions = (
            Homework.teacher_id == teacher_id,
            Homework.status == HomeworkStatus.SUBMITTED,
        )
        base = (
            select(HomeworkSubmission)
            .join(Homework, Homework.id == HomeworkSubmission.homework_id)
            .join(
                latest,
                (latest.c.homework_id == HomeworkSubmission.homework_id)
                & (latest.c.attempt_no == HomeworkSubmission.attempt_no),
            )
            .where(*conditions)
        )
        total = int(
            await self.session.scalar(select(func.count()).select_from(base.subquery())) or 0
        )
        student_profile = aliased(Profile)
        rows = (
            await self.session.execute(
                select(HomeworkSubmission, Homework, student_profile)
                .join(Homework, Homework.id == HomeworkSubmission.homework_id)
                .join(
                    latest,
                    (latest.c.homework_id == HomeworkSubmission.homework_id)
                    & (latest.c.attempt_no == HomeworkSubmission.attempt_no),
                )
                .join(student_profile, student_profile.user_id == Homework.student_id)
                .options(selectinload(HomeworkSubmission.attachments))
                .where(*conditions)
                .order_by(HomeworkSubmission.submitted_at.desc(), HomeworkSubmission.id.desc())
                .limit(limit)
                .offset(offset)
            )
        ).all()
        return [SubmissionRecord(row[0], row[1], row[2]) for row in rows], total

    async def teacher_submission(
        self, teacher_id: UUID, submission_id: UUID
    ) -> SubmissionRecord | None:
        student_profile = aliased(Profile)
        row = (
            await self.session.execute(
                select(HomeworkSubmission, Homework, student_profile)
                .join(Homework, Homework.id == HomeworkSubmission.homework_id)
                .join(student_profile, student_profile.user_id == Homework.student_id)
                .options(selectinload(HomeworkSubmission.attachments))
                .where(HomeworkSubmission.id == submission_id, Homework.teacher_id == teacher_id)
            )
        ).one_or_none()
        return SubmissionRecord(row[0], row[1], row[2]) if row else None
