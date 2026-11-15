import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin

MEDICATION_STATUSES = ("active", "paused", "stopped", "entered_in_error")
MEDICATION_BASES = ("prescribed", "self_reported")
DOSE_STATUSES = ("pending", "taken", "skipped")
NOTIFICATION_KINDS = ("dose_due", "refill_soon", "out_of_stock", "expiring_soon", "expired")

_VERIFICATION = (
    "verification_status IN ('patient_reported','clinician_confirmed','imported','unverified')"
)


class Medicine(Base):
    """Shared reference catalogue: names, forms and strengths only (no dosing or advice)."""

    __tablename__ = "medicines"
    __table_args__ = (
        CheckConstraint("source IN ('seed','admin')", name="source_valid"),
        UniqueConstraint("name", "form", "strength_text", name="uq_medicines_identity"),
        Index("ix_medicines_name_lower", text("lower(name)")),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    form: Mapped[str | None] = mapped_column(String(32))
    strength_text: Mapped[str | None] = mapped_column(String(64))
    # Phase 4 composition attributes; null means "not recorded", which blocks comparison.
    route: Mapped[str | None] = mapped_column(String(24))
    release_type: Mapped[str | None] = mapped_column(String(24))
    source: Mapped[str] = mapped_column(String(8), nullable=False, default="seed")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Prescription(Base, TimestampMixin):
    """An order written by a clinician. Distinct from what the patient says they take."""

    __tablename__ = "prescriptions"
    __table_args__ = (
        CheckConstraint("status IN ('active','entered_in_error')", name="status_valid"),
        CheckConstraint(_VERIFICATION, name="verification_valid"),
        CheckConstraint(
            "valid_until IS NULL OR prescribed_on IS NULL OR valid_until >= prescribed_on",
            name="dates_valid",
        ),
        Index("ix_prescriptions_patient", "patient_user_id", "prescribed_on"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    record_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("health_records.id", ondelete="RESTRICT"), index=True
    )
    prescriber_name: Mapped[str | None] = mapped_column(Text)
    prescribed_on: Mapped[date | None] = mapped_column(Date)
    valid_until: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active")
    verification_status: Mapped[str] = mapped_column(
        String(24), nullable=False, default="patient_reported"
    )


class Medication(Base, TimestampMixin):
    """What the patient takes. basis='prescribed' links to a Prescription; 'self_reported'
    is a medication statement (including over-the-counter use) with no prescription."""

    __tablename__ = "medications"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active','paused','stopped','entered_in_error')", name="status_valid"
        ),
        CheckConstraint("basis IN ('prescribed','self_reported')", name="basis_valid"),
        CheckConstraint(
            "(basis = 'prescribed' AND prescription_id IS NOT NULL) "
            "OR (basis = 'self_reported' AND prescription_id IS NULL)",
            name="basis_matches_prescription",
        ),
        CheckConstraint(_VERIFICATION, name="verification_valid"),
        CheckConstraint("units_per_dose > 0", name="units_positive"),
        CheckConstraint("refill_threshold_days BETWEEN 0 AND 90", name="threshold_valid"),
        CheckConstraint(
            "end_date IS NULL OR start_date IS NULL OR end_date >= start_date", name="dates_valid"
        ),
        Index("ix_medications_patient_status", "patient_user_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    medicine_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("medicines.id", ondelete="RESTRICT")
    )
    prescription_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("prescriptions.id", ondelete="RESTRICT"), index=True
    )
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    strength_text: Mapped[str | None] = mapped_column(String(64))
    form: Mapped[str | None] = mapped_column(String(32))
    # Free text exactly as printed on the label or prescription, e.g. "500 mg". Never computed.
    dose_text: Mapped[str | None] = mapped_column(String(120))
    # Stock units used per dose (1 tablet, 5 ml). Drives supply and refill arithmetic only.
    units_per_dose: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False, default=1)
    instructions: Mapped[str | None] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text)
    as_needed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    basis: Mapped[str] = mapped_column(String(16), nullable=False, default="self_reported")
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active")
    refill_threshold_days: Mapped[int] = mapped_column(Integer, nullable=False, default=7)
    verification_status: Mapped[str] = mapped_column(
        String(24), nullable=False, default="patient_reported"
    )


class MedicationSchedule(Base, TimestampMixin):
    __tablename__ = "medication_schedules"
    __table_args__ = (
        CheckConstraint("every_n_days BETWEEN 1 AND 365", name="interval_valid"),
        CheckConstraint("end_date IS NULL OR end_date >= start_date", name="dates_valid"),
        Index("ix_medication_schedules_medication", "medication_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    medication_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("medications.id", ondelete="RESTRICT"), nullable=False
    )
    # IANA zone the wall-clock times are interpreted in. Copied from the profile at creation
    # so later profile changes never silently move existing doses.
    timezone: Mapped[str] = mapped_column(Text, nullable=False)
    times: Mapped[list] = mapped_column(JSONB, nullable=False)  # ["08:00", "20:00"]
    days_of_week: Mapped[list | None] = mapped_column(JSONB)  # Monday=0 .. Sunday=6
    every_n_days: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class MedicationSupply(Base, TimestampMixin):
    """A box, strip or bottle: batch and lot, expiry and what is left."""

    __tablename__ = "medication_supplies"
    __table_args__ = (
        CheckConstraint("status IN ('active','discarded','entered_in_error')", name="status_valid"),
        CheckConstraint("quantity_initial > 0", name="initial_positive"),
        CheckConstraint("quantity_remaining >= 0", name="remaining_nonneg"),
        Index("ix_medication_supplies_medication", "medication_id", "expiry_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    medication_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("medications.id", ondelete="RESTRICT"), nullable=False
    )
    lot_number: Mapped[str | None] = mapped_column(String(64))
    manufacturer: Mapped[str | None] = mapped_column(Text)
    expiry_date: Mapped[date | None] = mapped_column(Date)
    received_on: Mapped[date | None] = mapped_column(Date)
    unit: Mapped[str | None] = mapped_column(String(16))
    quantity_initial: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    quantity_remaining: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active")


class DoseLog(Base, TimestampMixin):
    """One scheduled dose (generated as pending) or one ad-hoc dose (logged as taken).

    A dose becomes 'taken' only through an explicit patient action. Nothing in the
    system, including the worker, ever sets taken_at.
    """

    __tablename__ = "dose_logs"
    __table_args__ = (
        CheckConstraint("status IN ('pending','taken','skipped')", name="status_valid"),
        CheckConstraint(
            "(status = 'taken') = (taken_at IS NOT NULL)", name="taken_at_matches_status"
        ),
        CheckConstraint("scheduled_at IS NOT NULL OR status = 'taken'", name="ad_hoc_is_taken"),
        CheckConstraint("units_used IS NULL OR units_used >= 0", name="units_nonneg"),
        # Generation is idempotent: the same slot can only ever exist once.
        UniqueConstraint("schedule_id", "scheduled_at", name="uq_dose_logs_slot"),
        Index("ix_dose_logs_patient_scheduled", "patient_user_id", "scheduled_at"),
        Index("ix_dose_logs_medication", "medication_id", "scheduled_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    medication_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("medications.id", ondelete="RESTRICT"), nullable=False
    )
    schedule_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("medication_schedules.id", ondelete="RESTRICT")
    )
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    taken_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None] = mapped_column(Text)
    supply_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("medication_supplies.id", ondelete="RESTRICT")
    )
    units_used: Mapped[float | None] = mapped_column(Numeric(8, 2))


class Notification(Base, TimestampMixin):
    """In-app notification feed entry. (patient, dedupe_key) is unique, so every producer can
    run as often as it likes without creating duplicates."""

    __tablename__ = "notifications"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('dose_due','refill_soon','out_of_stock','expiring_soon','expired')",
            name="kind_valid",
        ),
        UniqueConstraint("patient_user_id", "dedupe_key", name="uq_notifications_dedupe"),
        Index("ix_notifications_patient_due", "patient_user_id", "due_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    dedupe_key: Mapped[str] = mapped_column(String(120), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    email_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    dose_log_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("dose_logs.id", ondelete="RESTRICT"), index=True
    )
    medication_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("medications.id", ondelete="RESTRICT"), index=True
    )
    supply_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("medication_supplies.id", ondelete="RESTRICT"), index=True
    )
