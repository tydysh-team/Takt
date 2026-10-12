from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.timezones import DEFAULT_TIMEZONE
from app.db.base import Base
from app.models.mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User


class Profile(TimestampMixin, Base):
    __tablename__ = "profiles"
    __table_args__ = (
        CheckConstraint("first_name = btrim(first_name)", name="ck_profiles_first_name_trimmed"),
        CheckConstraint("last_name = btrim(last_name)", name="ck_profiles_last_name_trimmed"),
        CheckConstraint("char_length(first_name) > 0", name="ck_profiles_first_name_not_empty"),
        CheckConstraint("char_length(last_name) > 0", name="ck_profiles_last_name_not_empty"),
        CheckConstraint(
            "middle_name IS NULL OR (middle_name = btrim(middle_name) "
            "AND char_length(middle_name) > 0)",
            name="ck_profiles_middle_name_normalized",
        ),
        CheckConstraint("char_length(timezone) > 0", name="ck_profiles_timezone_not_empty"),
    )

    user_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    middle_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    timezone: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default=DEFAULT_TIMEZONE,
        server_default=text("'Europe/Moscow'"),
    )

    user: Mapped["User"] = relationship(back_populates="profile")

