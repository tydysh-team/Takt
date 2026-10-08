from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, ForeignKey, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User


class Profile(TimestampMixin, Base):
    __tablename__ = "profiles"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_profiles_user_id"),
        CheckConstraint("first_name = btrim(first_name)", name="ck_profiles_first_name_trimmed"),
        CheckConstraint("last_name = btrim(last_name)", name="ck_profiles_last_name_trimmed"),
        CheckConstraint("char_length(first_name) > 0", name="ck_profiles_first_name_not_empty"),
        CheckConstraint("char_length(last_name) > 0", name="ck_profiles_last_name_not_empty"),
        CheckConstraint("char_length(timezone) > 0", name="ck_profiles_timezone_not_empty"),
    )

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    user_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    timezone: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default="UTC",
        server_default=text("'UTC'"),
    )

    user: Mapped["User"] = relationship(back_populates="profile")

