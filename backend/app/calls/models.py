"""Phone-app devices and reminder calls.

A `Device` is one installed copy of the MediCare AI phone app that can be woken by a push. A
`ReminderCall` is one attempt to ring a patient about one pending dose.

A call never changes a dose. A dose becomes 'taken' only when the patient taps the button in the
app, which calls the ordinary `POST /doses/{id}/take`. The call row only records how the ring
went (answered, declined, missed...).
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin

PLATFORMS = ("android", "ios")
CALL_STATUSES = ("ringing", "answered", "completed", "declined", "missed", "failed")
# Statuses after which a call can no longer change.
CALL_FINAL = ("completed", "declined", "missed", "failed")


class Device(Base, TimestampMixin):
    __tablename__ = "devices"
    __table_args__ = (
        CheckConstraint("platform IN ('android','ios')", name="platform_valid"),
        UniqueConstraint("push_token", name="uq_devices_push_token"),
        Index("ix_devices_user_seen", "user_id", "last_seen_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    platform: Mapped[str] = mapped_column(String(8), nullable=False)
    # FCM registration token (android) or APNs device token (ios).
    push_token: Mapped[str] = mapped_column(Text, nullable=False)
    # iOS only: the PushKit (VoIP) token. A VoIP push is what lets the phone ring when the app
    # is closed, so an iOS device without one cannot be rung.
    voip_token: Mapped[str | None] = mapped_column(Text)
    app_version: Mapped[str | None] = mapped_column(String(32))
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ReminderCall(Base, TimestampMixin):
    __tablename__ = "reminder_calls"
    __table_args__ = (
        CheckConstraint(
            "status IN ('ringing','answered','completed','declined','missed','failed')",
            name="status_valid",
        ),
        CheckConstraint("attempt >= 1", name="attempt_positive"),
        # One row per (dose, attempt): a retried or overlapping worker tick can't double-ring.
        UniqueConstraint("patient_user_id", "dedupe_key", name="uq_reminder_calls_dedupe"),
        Index("ix_reminder_calls_dose", "dose_log_id", "attempt"),
        Index("ix_reminder_calls_patient_created", "patient_user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    device_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("devices.id", ondelete="SET NULL"), index=True
    )
    dose_log_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("dose_logs.id", ondelete="RESTRICT"), nullable=False
    )
    dedupe_key: Mapped[str] = mapped_column(String(120), nullable=False)
    attempt: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="ringing")
    ring_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Short machine reason: no_answer, push_failed, push_unavailable, session_timeout, ...
    end_reason: Mapped[str | None] = mapped_column(String(32))
    # Set once audio was actually delivered to the phone (not just that the push was sent).
    media_connected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_detail: Mapped[str | None] = mapped_column(Text)
