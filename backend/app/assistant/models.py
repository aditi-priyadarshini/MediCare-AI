"""Phase 5 tables: chat sessions, messages, evidence references and an access log.

Chats hold the patient's own questions and the answers shown to them. Evidence rows store
references and a short label, not copies of reports. The access log records which records
informed an answer (ids and counts only) and survives chat deletion by design.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin

CLASSIFICATIONS = (
    "answered",
    "evidence_only",
    "fallback",
    "no_data",
    "urgent_escalation",
    "declined_treatment",
    "declined_diagnosis",
)
CONTEXT_KEYS = ("medicines", "history", "labs", "doses", "allergies")


class ChatSession(Base, TimestampMixin):
    __tablename__ = "chat_sessions"
    __table_args__ = (
        CheckConstraint("language IN ('en','hi','or')", name="language_valid"),
        Index("ix_chat_sessions_patient", "patient_user_id", "updated_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    title: Mapped[str] = mapped_column(Text, nullable=False, default="New chat")
    language: Mapped[str] = mapped_column(String(8), nullable=False, default="en")
    # Which kinds of patient record this chat may use. All off by default (minimum necessary).
    context_mode: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (
        CheckConstraint("role IN ('user','assistant')", name="role_valid"),
        CheckConstraint(
            "safety_classification IS NULL OR safety_classification IN "
            "('answered','evidence_only','fallback','no_data','urgent_escalation',"
            "'declined_treatment','declined_diagnosis')",
            name="classification_valid",
        ),
        Index("ix_chat_messages_session", "session_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(12), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    safety_classification: Mapped[str | None] = mapped_column(String(24))
    model_metadata: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class AiEvidenceItem(Base):
    __tablename__ = "ai_evidence_items"
    __table_args__ = (
        CheckConstraint(
            "source_type IN ('lab_result','medication','dose_log','condition','allergy',"
            "'health_record','reference','derived')",
            name="source_type_valid",
        ),
        Index("ix_ai_evidence_items_message", "message_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    message_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("chat_messages.id", ondelete="CASCADE"), nullable=False
    )
    ref_label: Mapped[str] = mapped_column(String(8), nullable=False)
    source_type: Mapped[str] = mapped_column(String(16), nullable=False)
    source_record_id: Mapped[uuid.UUID | None] = mapped_column()
    source_label: Mapped[str] = mapped_column(Text, nullable=False)
    recorded_at: Mapped[date | None] = mapped_column(Date)
    verification_status: Mapped[str | None] = mapped_column(String(24))
    # SHA-256 of the exact evidence text sent to the model; the text itself is not stored.
    excerpt_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    cited: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )


class ChatContextAccessLog(Base):
    """Append-only. Ids and counts only; no health content. Not deleted with the chat."""

    __tablename__ = "chat_context_access_logs"
    __table_args__ = (
        Index("ix_chat_context_access_logs_patient", "patient_user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    session_id: Mapped[uuid.UUID | None] = mapped_column()
    message_id: Mapped[uuid.UUID | None] = mapped_column()
    purpose: Mapped[str] = mapped_column(String(32), nullable=False)
    context: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    sources: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    provider: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
