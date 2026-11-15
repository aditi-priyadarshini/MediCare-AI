import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin

VERIFICATION_STATUSES = ("patient_reported", "clinician_confirmed", "imported", "unverified")


class PatientProfile(Base, TimestampMixin):
    __tablename__ = "patient_profiles"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), unique=True, nullable=False
    )
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    preferred_language: Mapped[str] = mapped_column(String(8), nullable=False, default="en")
    timezone: Mapped[str] = mapped_column(Text, nullable=False, default="Asia/Kolkata")
    height_cm: Mapped[float | None] = mapped_column(Numeric(5, 1))
    weight_kg: Mapped[float | None] = mapped_column(Numeric(5, 1))
    blood_group: Mapped[str | None] = mapped_column(String(3))
    blood_group_verification_status: Mapped[str] = mapped_column(
        String(24), nullable=False, default="unverified"
    )
    accessibility_preferences: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )


class PatientCondition(Base, TimestampMixin):
    __tablename__ = "patient_conditions"
    __table_args__ = (
        CheckConstraint(
            "verification_status IN "
            "('patient_reported','clinician_confirmed','imported','unverified')",
            name="verification_valid",
        ),
        CheckConstraint(
            "status IN ('active','resolved','inactive','entered_in_error')", name="status_valid"
        ),
        Index("ix_patient_conditions_patient", "patient_user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    condition_code: Mapped[str | None] = mapped_column(Text)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active")
    verification_status: Mapped[str] = mapped_column(
        String(24), nullable=False, default="patient_reported"
    )
    onset_date: Mapped[date | None] = mapped_column(Date)
    resolved_date: Mapped[date | None] = mapped_column(Date)


class PatientAllergy(Base, TimestampMixin):
    __tablename__ = "patient_allergies"
    __table_args__ = (
        CheckConstraint(
            "verification_status IN "
            "('patient_reported','clinician_confirmed','imported','unverified')",
            name="verification_valid",
        ),
        CheckConstraint("status IN ('active','entered_in_error')", name="status_valid"),
        CheckConstraint(
            "severity IS NULL OR severity IN ('mild','moderate','severe','unknown')",
            name="severity_valid",
        ),
        Index("ix_patient_allergies_patient", "patient_user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    substance: Mapped[str] = mapped_column(Text, nullable=False)
    reaction: Mapped[str | None] = mapped_column(Text)
    severity: Mapped[str | None] = mapped_column(String(16))
    verification_status: Mapped[str] = mapped_column(
        String(24), nullable=False, default="patient_reported"
    )
    source: Mapped[str] = mapped_column(String(24), nullable=False, default="patient")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active")


class EmergencyContact(Base, TimestampMixin):
    __tablename__ = "emergency_contacts"
    __table_args__ = (Index("ix_emergency_contacts_patient", "patient_user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    relationship: Mapped[str | None] = mapped_column(Text)
    phone_e164: Mapped[str] = mapped_column(String(16), nullable=False)
    email: Mapped[str | None] = mapped_column(Text)
    is_primary: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )


class UserConsent(Base):
    """Append-only consent ledger. Current state = latest row per consent_type."""

    __tablename__ = "user_consents"
    __table_args__ = (Index("ix_user_consents_user_type", "user_id", "consent_type"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    consent_type: Mapped[str] = mapped_column(String(32), nullable=False)
    policy_version: Mapped[str] = mapped_column(String(32), nullable=False)
    granted: Mapped[bool] = mapped_column(Boolean, nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
