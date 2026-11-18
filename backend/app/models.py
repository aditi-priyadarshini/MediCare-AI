import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin

SHARE_CATEGORIES = ("profile", "conditions", "allergies", "medications", "labs", "records")
SHARE_EVENTS = (
    "code_sent",
    "code_failed",
    "verified",
    "viewed",
    "blocked_revoked",
    "blocked_expired",
)


class ShareGrant(Base, TimestampMixin):
    """A patient's consent to show a chosen slice of their record to one named recipient.

    The link token is random and only its SHA-256 is stored. The grant is re-checked (revoked,
    expired, scope) on every view, so revocation takes effect on the next request.
    """

    __tablename__ = "share_grants"
    __table_args__ = (
        CheckConstraint(
            "date_from IS NULL OR date_to IS NULL OR date_from <= date_to", name="dates_valid"
        ),
        CheckConstraint(
            "jsonb_typeof(categories) = 'array' AND categories <> '[]'::jsonb",
            name="categories_valid",
        ),
        Index("ix_share_grants_patient_created", "patient_user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    recipient_name: Mapped[str] = mapped_column(Text, nullable=False)
    recipient_email: Mapped[str] = mapped_column(Text, nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    categories: Mapped[list] = mapped_column(JSONB, nullable=False)
    date_from: Mapped[date | None] = mapped_column(Date)
    date_to: Mapped[date | None] = mapped_column(Date)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_accessed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    access_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class ShareAccessChallenge(Base):
    """One-time code emailed to the recipient address the patient named (recipient check)."""

    __tablename__ = "share_access_challenges"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    grant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("share_grants.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ShareAccessLog(Base):
    """Append-only. Event names, times and the caller's IP only: never medical content."""

    __tablename__ = "share_access_logs"
    __table_args__ = (
        CheckConstraint(
            "event IN ('code_sent','code_failed','verified','viewed',"
            "'blocked_revoked','blocked_expired')",
            name="event_valid",
        ),
        Index("ix_share_access_logs_grant_created", "grant_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    grant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("share_grants.id", ondelete="RESTRICT"), nullable=False
    )
    event: Mapped[str] = mapped_column(String(24), nullable=False)
    ip: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
