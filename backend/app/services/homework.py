import asyncio
import codecs
import hashlib
import json
import logging
import zipfile
from datetime import UTC
from pathlib import PurePath
from uuid import UUID, uuid4

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import utc_now
from app.models.enums import RelationStatus, RoleCode
from app.models.homework import (
    Homework,
    HomeworkAttachment,
    HomeworkReview,
    HomeworkStatus,
    HomeworkSubmission,
    ReviewDecision,
)
from app.models.teacher_student_relation import TeacherStudentRelation
from app.models.user import User
from app.repositories.homework import HomeworkRecord, HomeworkRepository, SubmissionRecord
from app.schemas.homework import (
    HomeworkAttachmentDTO,
    HomeworkCreate,
    HomeworkDTO,
    HomeworkPage,
    HomeworkReviewCreate,
    HomeworkReviewDTO,
    HomeworkRevisionCreate,
    HomeworkSubmissionDTO,
    HomeworkSubmissionResult,
    PendingSubmissionDTO,
    PendingSubmissionPage,
)
from app.storage.s3 import S3Storage

logger = logging.getLogger(__name__)
MAX_FILE_SIZE = 10 * 1024 * 1024
MIME_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}


class HomeworkFailure(Exception):
    def __init__(self, code: str, message: str, status: int) -> None:
        self.code = code
        self.message = message
        self.status = status


async def inspect_file(upload: UploadFile) -> tuple[str, str, int, str]:
    name = upload.filename or ""
    if (
        not name
        or len(name) > 255
        or any(ord(char) < 32 for char in name)
        or "/" in name
        or "\\" in name
    ):
        raise HomeworkFailure("invalid_attachment", "Недопустимое имя файла.", 422)
    extension = PurePath(name).suffix.lower()
    mime = MIME_TYPES.get(extension)
    if mime is None:
        raise HomeworkFailure("invalid_attachment", "Тип файла не поддерживается.", 422)
    digest = hashlib.sha256()
    decoder = codecs.getincrementaldecoder("utf-8")() if extension == ".txt" else None
    size = 0
    first = b""
    tail = b""
    while chunk := await upload.read(64 * 1024):
        size += len(chunk)
        if size > MAX_FILE_SIZE:
            raise HomeworkFailure("attachment_too_large", "Файл превышает 10 МБ.", 422)
        digest.update(chunk)
        if len(first) < 16:
            first = (first + chunk)[:16]
        tail = (tail + chunk)[-1024:]
        if decoder is not None:
            if b"\x00" in chunk:
                raise HomeworkFailure(
                    "invalid_attachment", "Текстовый файл содержит двоичные данные.", 422
                )
            try:
                decoder.decode(chunk)
            except UnicodeDecodeError as exc:
                raise HomeworkFailure(
                    "invalid_attachment", "Текстовый файл должен быть UTF-8.", 422
                ) from exc
    if size == 0:
        raise HomeworkFailure("invalid_attachment", "Пустые файлы не поддерживаются.", 422)
    if decoder is not None:
        try:
            decoder.decode(b"", final=True)
        except UnicodeDecodeError as exc:
            raise HomeworkFailure(
                "invalid_attachment", "Текстовый файл должен быть UTF-8.", 422
            ) from exc
    valid = (
        (extension == ".pdf" and first.startswith(b"%PDF-") and b"%%EOF" in tail)
        or (extension == ".docx" and first.startswith(b"PK\x03\x04"))
        or (extension == ".txt" and decoder is not None)
        or (extension == ".png" and first.startswith(b"\x89PNG\r\n\x1a\n") and b"IEND" in tail)
        or (
            extension in {".jpg", ".jpeg"}
            and first.startswith(b"\xff\xd8\xff")
            and tail.endswith(b"\xff\xd9")
        )
    )
    if not valid:
        raise HomeworkFailure("invalid_attachment", "Содержимое файла не соответствует типу.", 422)
    await upload.seek(0)
    if extension == ".docx":
        try:

            def verify_docx() -> bool:
                with zipfile.ZipFile(upload.file) as archive:
                    names = set(archive.namelist())
                    return (
                        "[Content_Types].xml" in names
                        and "word/document.xml" in names
                        and not any(name.endswith("vbaProject.bin") for name in names)
                    )

            if not await asyncio.to_thread(verify_docx):
                raise ValueError("Invalid document package")
        except (ValueError, zipfile.BadZipFile) as exc:
            raise HomeworkFailure("invalid_attachment", "Некорректный DOCX-файл.", 422) from exc
        await upload.seek(0)
    return name, mime, size, digest.hexdigest()


def to_dto(record: HomeworkRecord) -> HomeworkDTO:
    item = record.homework
    return HomeworkDTO(
        id=item.id,
        teacher_id=item.teacher_id,
        teacher_name=f"{record.teacher_profile.first_name} {record.teacher_profile.last_name}",
        student_id=item.student_id,
        student_name=f"{record.student_profile.first_name} {record.student_profile.last_name}",
        title=item.title,
        description=item.description,
        due_at=item.due_at,
        status=item.status,
        is_overdue=item.status in {HomeworkStatus.ASSIGNED, HomeworkStatus.NEEDS_REVISION}
        and item.due_at < utc_now(),
        created_at=item.created_at,
        attachments=[attachment_dto(a) for a in item.attachments],
        latest_submission=(
            submission_dto(max(item.submissions, key=lambda entry: entry.attempt_no))
            if item.submissions
            else None
        ),
    )


def attachment_dto(item: HomeworkAttachment) -> HomeworkAttachmentDTO:
    return HomeworkAttachmentDTO(
        id=item.id,
        original_name=item.original_name,
        mime_type=item.mime_type,
        size_bytes=item.size_bytes,
        sha256=item.sha256,
        created_at=item.created_at,
    )


def submission_dto(item: HomeworkSubmission) -> HomeworkSubmissionDTO:
    return HomeworkSubmissionDTO(
        id=item.id,
        homework_id=item.homework_id,
        attempt_no=item.attempt_no,
        comment=item.comment,
        submitted_at=item.submitted_at,
        is_late=item.is_late,
        attachments=[attachment_dto(attachment) for attachment in item.attachments],
        review=(
            HomeworkReviewDTO(
                id=item.review.id,
                decision=item.review.decision,
                grade=int(item.review.grade) if item.review.grade is not None else None,
                comment=item.review.comment,
                reviewed_at=item.review.reviewed_at,
            )
            if item.review is not None else None
        ),
    )


def pending_dto(record: SubmissionRecord) -> PendingSubmissionDTO:
    return PendingSubmissionDTO(
        **submission_dto(record.submission).model_dump(),
        student_id=record.homework.student_id,
        student_name=f"{record.student_profile.first_name} {record.student_profile.last_name}",
        title=record.homework.title,
        due_at=record.homework.due_at,
        homework_status=record.homework.status,
    )


class HomeworkService:
    def __init__(self, session: AsyncSession, storage: S3Storage | None = None) -> None:
        self.session = session
        self.storage = storage
        self.repo = HomeworkRepository(session)

    async def submit(
        self,
        student: User,
        homework_id: UUID,
        comment: str | None,
        files: list[UploadFile],
        key: UUID,
    ) -> HomeworkSubmissionResult:
        if student.role != RoleCode.STUDENT:
            raise HomeworkFailure("forbidden", "Операция недоступна.", 403)
        if len(files) > 5:
            raise HomeworkFailure(
                "too_many_attachments", "Можно приложить не более пяти файлов.", 422
            )
        normalized_comment = (comment or "").strip() or None
        if normalized_comment is not None and len(normalized_comment) > 10000:
            raise HomeworkFailure("invalid_comment", "Комментарий слишком длинный.", 422)
        if normalized_comment is None and not files:
            raise HomeworkFailure("empty_submission", "Добавьте комментарий или файл.", 422)
        metadata = [await inspect_file(upload) for upload in files]
        fingerprint = hashlib.sha256(
            json.dumps([normalized_comment, metadata], ensure_ascii=False).encode()
        ).hexdigest()
        uploaded_keys: list[str] = []
        try:
            homework = await self.repo.lock_for_submission(homework_id, student.id)
            if homework is None:
                raise HomeworkFailure("homework_not_found", "Задание не найдено.", 404)
            previous = await self.repo.submission_by_key(homework_id, key)
            if previous is not None:
                if previous.request_fingerprint != fingerprint:
                    raise HomeworkFailure(
                        "idempotency_conflict",
                        "Ключ повтора уже использован для другой работы.",
                        409,
                    )
                record = await self.repo.get(homework_id, student_id=student.id)
                assert record is not None
                result = HomeworkSubmissionResult(
                    submission=submission_dto(previous), homework=to_dto(record)
                )
                await self.session.rollback()
                return result
            if homework.status not in {HomeworkStatus.ASSIGNED, HomeworkStatus.NEEDS_REVISION}:
                raise HomeworkFailure("submission_conflict", "Задание сейчас нельзя сдать.", 409)
            previous_attempt = await self.repo.latest_submission(homework.id)
            submission = HomeworkSubmission(
                id=uuid4(),
                homework_id=homework.id,
                attempt_no=previous_attempt.attempt_no + 1 if previous_attempt else 1,
                comment=normalized_comment,
                submitted_at=utc_now(),
                is_late=False,
                idempotency_key=key,
                request_fingerprint=fingerprint,
            )
            self.repo.add_submission(submission)
            await self.session.flush()
            if files:
                if self.storage is None:
                    raise HomeworkFailure(
                        "storage_unavailable", "Хранилище файлов недоступно.", 503
                    )
                try:
                    await self.storage.ensure_bucket()
                except Exception as exc:
                    raise HomeworkFailure(
                        "storage_unavailable", "Хранилище файлов недоступно.", 503
                    ) from exc
            for upload, (name, mime, size, sha256) in zip(files, metadata, strict=True):
                attachment_id = uuid4()
                storage_key = f"submissions/{submission.id}/{attachment_id}"
                uploaded_keys.append(storage_key)
                try:
                    assert self.storage is not None
                    await self.storage.upload_object(storage_key, upload.file, mime)
                except Exception as exc:
                    raise HomeworkFailure(
                        "storage_unavailable", "Не удалось загрузить файл.", 503
                    ) from exc
                self.repo.add_attachment(
                    HomeworkAttachment(
                        id=attachment_id,
                        submission_id=submission.id,
                        storage_key=storage_key,
                        original_name=name,
                        mime_type=mime,
                        size_bytes=size,
                        sha256=sha256,
                    )
                )
            await self.session.flush()
            submitted_at = utc_now()
            submission.submitted_at = submitted_at
            submission.is_late = submitted_at > homework.due_at
            homework.status = HomeworkStatus.SUBMITTED
            await self.session.flush()
            await self.session.refresh(submission, attribute_names=["attachments"])
            self.session.expire(homework, ["submissions"])
            record = await self.repo.get(homework.id, student_id=student.id)
            assert record is not None
            result = HomeworkSubmissionResult(
                submission=submission_dto(submission),
                homework=to_dto(record).model_copy(
                    update={
                        "status": HomeworkStatus.SUBMITTED,
                        "latest_submission": submission_dto(submission),
                    }
                ),
            )
            await self.session.commit()
            return result
        except Exception:
            await self.session.rollback()
            if self.storage is not None:
                for storage_key in uploaded_keys:
                    try:
                        await self.storage.delete_object(storage_key)
                    except Exception:
                        logger.exception(
                            "Failed to compensate submission upload",
                            extra={"storage_key": storage_key},
                        )
            raise

    async def pending(self, teacher: User, limit: int, offset: int) -> PendingSubmissionPage:
        records, total = await self.repo.pending_page(teacher.id, limit, offset)
        return PendingSubmissionPage(
            items=[pending_dto(record) for record in records],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def review_submission(
        self,
        teacher: User,
        submission_id: UUID,
        *,
        accepted: HomeworkReviewCreate | None = None,
        revision: HomeworkRevisionCreate | None = None,
    ) -> HomeworkSubmissionDTO:
        if teacher.role != RoleCode.TEACHER:
            raise HomeworkFailure("forbidden", "Операция недоступна.", 403)
        try:
            homework = await self.repo.lock_for_review(submission_id, teacher.id)
            if homework is None:
                raise HomeworkFailure("submission_not_found", "Работа не найдена.", 404)
            current = await self.repo.latest_submission(homework.id)
            if (
                homework.status != HomeworkStatus.SUBMITTED
                or current is None
                or current.id != submission_id
                or current.review is not None
            ):
                raise HomeworkFailure(
                    "review_conflict", "Работа уже обработана или изменилась.", 409
                )
            if accepted is not None:
                decision = ReviewDecision.ACCEPTED
                grade = accepted.grade
                comment = (accepted.comment or "").strip() or None
                homework.status = HomeworkStatus.REVIEWED
            else:
                assert revision is not None
                decision = ReviewDecision.NEEDS_REVISION
                grade = None
                comment = revision.comment
                homework.status = HomeworkStatus.NEEDS_REVISION
            review = HomeworkReview(
                id=uuid4(), submission_id=current.id, decision=decision,
                grade=grade, comment=comment, reviewed_at=utc_now(),
            )
            current.review = review
            self.repo.add_review(review)
            await self.session.flush()
            result = submission_dto(current)
            await self.session.commit()
            return result
        except Exception:
            await self.session.rollback()
            raise

    async def history(self, user: User, homework_id: UUID) -> list[HomeworkSubmissionDTO]:
        await self.accessible_record(user, homework_id)
        return [submission_dto(item) for item in await self.repo.history(homework_id)]

    async def student_submission_attachment(
        self, student: User, homework_id: UUID, submission_id: UUID, attachment_id: UUID
    ) -> HomeworkAttachment:
        await self.accessible_record(student, homework_id)
        submissions = await self.repo.history(homework_id)
        submission = next((item for item in submissions if item.id == submission_id), None)
        attachment = next(
            (item for item in submission.attachments if item.id == attachment_id), None
        ) if submission is not None else None
        if attachment is None:
            raise HomeworkFailure("submission_not_found", "Файл не найден.", 404)
        return attachment

    async def teacher_submission(self, teacher: User, submission_id: UUID) -> PendingSubmissionDTO:
        record = await self.repo.teacher_submission(teacher.id, submission_id)
        if record is None:
            raise HomeworkFailure("submission_not_found", "Работа не найдена.", 404)
        return pending_dto(record)

    async def submission_attachment(
        self,
        teacher: User,
        submission_id: UUID,
        attachment_id: UUID,
    ) -> HomeworkAttachment:
        record = await self.repo.teacher_submission(teacher.id, submission_id)
        if record is None:
            raise HomeworkFailure("submission_not_found", "Файл не найден.", 404)
        attachment = next(
            (item for item in record.submission.attachments if item.id == attachment_id), None
        )
        if attachment is None:
            raise HomeworkFailure("submission_not_found", "Файл не найден.", 404)
        return attachment

    async def create(
        self, teacher: User, payload: HomeworkCreate, files: list[UploadFile], key: UUID
    ) -> HomeworkDTO:
        if len(files) > 5:
            raise HomeworkFailure(
                "too_many_attachments", "Можно приложить не более пяти файлов.", 422
            )
        metadata = [await inspect_file(upload) for upload in files]
        normalized_due = payload.due_at.astimezone(UTC)
        fingerprint = hashlib.sha256(
            json.dumps(
                [
                    str(payload.student_id),
                    payload.title,
                    payload.description,
                    normalized_due.isoformat(),
                    metadata,
                ],
                ensure_ascii=False,
            ).encode()
        ).hexdigest()
        uploaded_keys: list[str] = []
        try:
            await self.session.scalar(
                select(User.id).where(User.id == teacher.id).with_for_update()
            )
            previous = await self.repo.by_idempotency_key(teacher.id, key)
            if previous is not None:
                if previous.request_fingerprint != fingerprint:
                    raise HomeworkFailure(
                        "idempotency_conflict",
                        "Ключ повтора уже использован для другого задания.",
                        409,
                    )
                record = await self.repo.get(previous.id, teacher_id=teacher.id)
                assert record is not None
                result = to_dto(record)
                await self.session.rollback()
                return result
            relation = await self.session.scalar(
                select(TeacherStudentRelation)
                .join(User, User.id == TeacherStudentRelation.student_id)
                .where(
                    TeacherStudentRelation.teacher_id == teacher.id,
                    TeacherStudentRelation.student_id == payload.student_id,
                    TeacherStudentRelation.status == RelationStatus.ACTIVE,
                    User.is_active.is_(True),
                )
                .with_for_update(of=TeacherStudentRelation)
            )
            if relation is None:
                raise HomeworkFailure("student_not_available", "Ученик недоступен.", 404)
            homework = Homework(
                id=uuid4(),
                teacher_id=teacher.id,
                student_id=payload.student_id,
                title=payload.title,
                description=payload.description,
                due_at=normalized_due,
                status=HomeworkStatus.ASSIGNED,
                idempotency_key=key,
                request_fingerprint=fingerprint,
            )
            self.repo.add(homework)
            await self.session.flush()
            if files:
                if self.storage is None:
                    raise HomeworkFailure(
                        "storage_unavailable", "Хранилище файлов недоступно.", 503
                    )
                try:
                    await self.storage.ensure_bucket()
                except Exception as exc:
                    raise HomeworkFailure(
                        "storage_unavailable", "Хранилище файлов недоступно.", 503
                    ) from exc
            for upload, (name, mime, size, sha256) in zip(files, metadata, strict=True):
                attachment_id = uuid4()
                storage_key = f"assignments/{homework.id}/{attachment_id}"
                uploaded_keys.append(storage_key)
                try:
                    assert self.storage is not None
                    await self.storage.upload_object(storage_key, upload.file, mime)
                except Exception as exc:
                    raise HomeworkFailure(
                        "storage_unavailable", "Не удалось загрузить файл.", 503
                    ) from exc
                self.repo.add_attachment(
                    HomeworkAttachment(
                        id=attachment_id,
                        homework_id=homework.id,
                        storage_key=storage_key,
                        original_name=name,
                        mime_type=mime,
                        size_bytes=size,
                        sha256=sha256,
                    )
                )
            await self.session.flush()
            record = await self.repo.get(homework.id, teacher_id=teacher.id)
            assert record is not None
            result = to_dto(record)
            await self.session.commit()
            return result
        except Exception:
            await self.session.rollback()
            if self.storage is not None:
                for storage_key in uploaded_keys:
                    try:
                        await self.storage.delete_object(storage_key)
                    except Exception:
                        logger.exception(
                            "Failed to compensate homework upload",
                            extra={"storage_key": storage_key},
                        )
            raise

    async def list_page(
        self, user: User, person_filter: UUID | None, limit: int, offset: int
    ) -> HomeworkPage:
        if user.role == RoleCode.TEACHER:
            records, total = await self.repo.list_page(
                teacher_id=user.id, person_filter=person_filter, limit=limit, offset=offset
            )
        elif user.role == RoleCode.STUDENT:
            records, total = await self.repo.list_page(
                student_id=user.id, person_filter=person_filter, limit=limit, offset=offset
            )
        else:
            raise HomeworkFailure("forbidden", "Операция недоступна.", 403)
        return HomeworkPage(
            items=[to_dto(record) for record in records], total=total, limit=limit, offset=offset
        )

    async def get(self, user: User, homework_id: UUID) -> HomeworkDTO:
        record = await self.accessible_record(user, homework_id)
        return to_dto(record)

    async def accessible_record(self, user: User, homework_id: UUID) -> HomeworkRecord:
        if user.role == RoleCode.TEACHER:
            record = await self.repo.get(homework_id, teacher_id=user.id)
        elif user.role == RoleCode.STUDENT:
            record = await self.repo.get(homework_id, student_id=user.id)
        else:
            raise HomeworkFailure("forbidden", "Операция недоступна.", 403)
        if record is None:
            raise HomeworkFailure("homework_not_found", "Задание не найдено.", 404)
        return record

    async def attachment(
        self, user: User, homework_id: UUID, attachment_id: UUID
    ) -> HomeworkAttachment:
        record = await self.accessible_record(user, homework_id)
        attachment = next(
            (item for item in record.homework.attachments if item.id == attachment_id), None
        )
        if attachment is None:
            raise HomeworkFailure("homework_not_found", "Файл не найден.", 404)
        return attachment
