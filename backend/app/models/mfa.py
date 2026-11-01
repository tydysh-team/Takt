from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserTotp(Base):
    __tablename__ = "user_totp"

    user_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    encrypted_secret: Mapped[str | None] = mapped_column(String(512), nullable=True)
    pending_secret: Mapped[str | None] = mapped_column(String(512), nullable=True)
    pending_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    enabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_used_step: Mapped[int | None] = mapped_column(Integer)


class MfaChallenge(Base):
    __tablename__ = "mfa_challenges"
    __table_args__ = (UniqueConstraint("token_digest", name="uq_mfa_challenge_digest"),)

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class MfaBackupCode(Base):
    __tablename__ = "mfa_backup_codes"
    __table_args__ = (UniqueConstraint("code_digest", name="uq_mfa_backup_digest"),)

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    code_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
