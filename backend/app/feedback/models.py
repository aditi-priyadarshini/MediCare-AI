"""Platform feedback from patients about the application itself.

This is deliberately separate from adverse-event reports (clinical, `safety`). Feedback is
not a health record, is never used by the assistant, and is read only by moderators.
"""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin

CATEGORIES = ("general", "bug", "accessibility", "content", "other")
STATUSES = ("new", "reviewed", "actioned", "dismissed")


class Feedback(Base, TimestampMixin):
    __tablename__ = "feedback"
    __table_args__ = (
        CheckConstraint(
            "category IN ('general','bug','accessibility','content','other')", name="category_valid"
        ),
        CheckConstraint("status IN ('new','reviewed','actioned','dismissed')", name="status_valid"),
        CheckConstraint(
            "status = 'new' OR (moderated_by_user_id IS NOT NULL AND moderated_at IS NOT NULL)",
            name="moderation_recorded",
        ),
        Index("ix_feedback_status_created", "status", "created_at"),
        Index("ix_feedback_user", "user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    category: Mapped[str] = mapped_column(String(16), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    page: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="new")
    moderator_note: Mapped[str | None] = mapped_column(Text)
    moderated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    moderated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
