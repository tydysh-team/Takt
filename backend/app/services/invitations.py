from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.exceptions import (
    AlreadyConnectedError,
    ForbiddenError,
    InvalidInvitationError,
    InvitationNotActiveError,
    InvitationNotFoundError,
)
from app.core.invitation_codes import InvitationCodeService
from app.core.security import utc_now
from app.models.enums import RelationStatus, UserRole
from app.models.profile import Profile
from app.models.teacher_invitation import TeacherInvitation
from app.models.teacher_student_relation import TeacherStudentRelation
from app.models.user import User
from app.repositories.teacher_invitations import TeacherInvitationRepository
from app.repositories.teacher_student_relations import TeacherStudentRelationRepository
from app.repositories.users import UserRepository
from app.schemas.invitations import InvitationStatus


@dataclass(frozen=True, slots=True)
class CreatedInvitation:
    invitation: TeacherInvitation
    raw_code: str


@dataclass(frozen=True, slots=True)
class ListedInvitation:
    invitation: TeacherInvitation
    status: InvitationStatus


@dataclass(frozen=True, slots=True)
class AcceptedConnection:
    relation: TeacherStudentRelation
    teacher: User
    teacher_profile: Profile


class InvitationService:
    def __init__(
        self,
        *,
        session: AsyncSession,
        settings: Settings,
        codes: InvitationCodeService,
    ) -> None:
        self._session = session
        self._settings = settings
        self._codes = codes
        self._invitations = TeacherInvitationRepository(session)
        self._relations = TeacherStudentRelationRepository(session)
        self._users = UserRepository(session)

    async def create(self, teacher: User) -> CreatedInvitation:
        self._ensure_role(teacher, UserRole.TEACHER)
        now = utc_now()
        generated = self._codes.generate()
        invitation = TeacherInvitation(
            teacher_id=teacher.id,
            code_digest=generated.digest,
            created_at=now,
            expires_at=now + timedelta(days=self._settings.invitation_ttl_days),
        )
        try:
            self._invitations.add(invitation)
            await self._session.commit()
        except Exception:
            await self._session.rollback()
            raise
        return CreatedInvitation(invitation=invitation, raw_code=generated.raw)

    async def list_for_teacher(self, teacher: User) -> list[ListedInvitation]:
        self._ensure_role(teacher, UserRole.TEACHER)
        now = utc_now()
        invitations = await self._invitations.list_for_teacher(teacher.id)
        return [
            ListedInvitation(invitation=item, status=self._status(item, now))
            for item in invitations
        ]

    async def revoke(self, teacher: User, invitation_id: UUID) -> None:
        self._ensure_role(teacher, UserRole.TEACHER)
        now = utc_now()
        try:
            invitation = await self._invitations.get_owned_by_id(
                invitation_id,
                teacher.id,
                for_update=True,
            )
            if invitation is None:
                raise InvitationNotFoundError()
            if invitation.revoked_at is not None:
                await self._session.rollback()
                return
            if invitation.used_at is not None or invitation.expires_at <= now:
                raise InvitationNotActiveError()
            invitation.revoked_at = now
            await self._session.commit()
        except (InvitationNotFoundError, InvitationNotActiveError):
            await self._session.rollback()
            raise
        except Exception:
            await self._session.rollback()
            raise

    async def accept(self, student: User, raw_code: str) -> AcceptedConnection:
        self._ensure_role(student, UserRole.STUDENT)
        try:
            code_digest = self._codes.digest(raw_code)
        except ValueError as exc:
            raise InvalidInvitationError() from exc

        now = utc_now()
        try:
            invitation = await self._invitations.get_by_digest_for_update(code_digest)
            if (
                invitation is None
                or invitation.revoked_at is not None
                or invitation.used_at is not None
                or invitation.expires_at <= now
            ):
                raise InvalidInvitationError()

            teacher = await self._users.get_by_id(invitation.teacher_id)
            teacher_profile = teacher.profile if teacher is not None else None
            if (
                teacher is None
                or teacher.role != UserRole.TEACHER
                or not teacher.is_active
                or teacher_profile is None
            ):
                raise InvalidInvitationError()

            relation = await self._relations.get_by_pair(
                teacher.id,
                student.id,
                for_update=True,
            )
            if relation is not None and relation.status == RelationStatus.ACTIVE:
                raise AlreadyConnectedError()
            if relation is None:
                relation = TeacherStudentRelation(
                    teacher_id=teacher.id,
                    student_id=student.id,
                    status=RelationStatus.ACTIVE,
                    created_at=now,
                )
                self._relations.add(relation)
            else:
                relation.status = RelationStatus.ACTIVE
                relation.deactivated_at = None

            invitation.used_at = now
            invitation.used_by_student_id = student.id
            await self._session.commit()
        except (AlreadyConnectedError, InvalidInvitationError):
            await self._session.rollback()
            raise
        except IntegrityError as exc:
            await self._session.rollback()
            driver_error = getattr(exc.orig, "__cause__", None) or exc.orig
            if getattr(driver_error, "constraint_name", None) == (
                "uq_teacher_student_relations_pair"
            ):
                raise AlreadyConnectedError() from exc
            raise
        except Exception:
            await self._session.rollback()
            raise

        return AcceptedConnection(
            relation=relation,
            teacher=teacher,
            teacher_profile=teacher_profile,
        )

    @staticmethod
    def _ensure_role(user: User, expected: UserRole) -> None:
        if user.role != expected or not user.is_active:
            raise ForbiddenError()

    @staticmethod
    def _status(invitation: TeacherInvitation, now: datetime) -> InvitationStatus:
        if invitation.revoked_at is not None:
            return InvitationStatus.REVOKED
        if invitation.used_at is not None:
            return InvitationStatus.USED
        if invitation.expires_at <= now:
            return InvitationStatus.EXPIRED
        return InvitationStatus.ACTIVE
