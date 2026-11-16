"""Phase 7 care discovery: sourced pharmacy and doctor directories, inventory snapshots, and
appointment requests.

Directory data is shared and admin-curated. Every row names the source it came from and when that
source was observed, so the UI can say how old it is. Nothing here is a live feed unless a
snapshot says so: stock is only ever what a named source reported at a stated time, and an
appointment is only `confirmed` after a provider response has been recorded.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import (
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
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin

SOURCE_KINDS = ("directory", "inventory", "credential")
LISTING_STATUSES = ("unverified", "source_listed")
CREDENTIAL_STATUSES = ("unverified", "source_listed", "verified")
AVAILABILITIES = ("in_stock", "low_stock", "out_of_stock")
BOOKING_MODES = ("request_only", "provider")
APPOINTMENT_STATUSES = ("request_only", "sent", "confirmed", "declined", "cancelled")
WINDOWS = ("any", "morning", "afternoon", "evening")


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class ProviderSource(Base):
    """Where directory, stock or credential data came from. `stale_after_hours` is that source's
    own freshness policy: data older than this is labelled stale, never hidden."""

    __tablename__ = "provider_sources"
    __table_args__ = (
        UniqueConstraint("name", "kind", "retrieved_on", name="uq_provider_sources_identity"),
        CheckConstraint(_in("kind", SOURCE_KINDS), name="kind_valid"),
        CheckConstraint("stale_after_hours > 0", name="stale_after_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    publisher: Mapped[str | None] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(Text)
    licence: Mapped[str | None] = mapped_column(Text)
    jurisdiction: Mapped[str] = mapped_column(String(16), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    retrieved_on: Mapped[date] = mapped_column(Date, nullable=False)
    stale_after_hours: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Pharmacy(Base, TimestampMixin):
    __tablename__ = "pharmacies"
    __table_args__ = (
        CheckConstraint(_in("verification_status", LISTING_STATUSES), name="verification_valid"),
        CheckConstraint("status IN ('active','retired')", name="status_valid"),
        CheckConstraint(
            "(latitude IS NULL) = (longitude IS NULL)", name="coordinates_both_or_neither"
        ),
        CheckConstraint(
            "latitude IS NULL OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)",
            name="coordinates_in_range",
        ),
        Index("ix_pharmacies_city_lower", text("lower(city)")),
        Index("ix_pharmacies_coordinates", "latitude", "longitude"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    address_line: Mapped[str] = mapped_column(Text, nullable=False)
    city: Mapped[str] = mapped_column(Text, nullable=False)
    state: Mapped[str | None] = mapped_column(Text)
    postal_code: Mapped[str | None] = mapped_column(String(12))
    latitude: Mapped[float | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[float | None] = mapped_column(Numeric(9, 6))
    phone: Mapped[str | None] = mapped_column(String(24))
    # Free text exactly as the source gave it. Never parsed into "open now".
    hours_text: Mapped[str | None] = mapped_column(Text)
    source_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("provider_sources.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    source_observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    verification_status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="source_listed"
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")


class PharmacyInventorySnapshot(Base):
    """What one named source reported about one medicine at one pharmacy, at `source_timestamp`.
    Rows are only ever added; the latest per (pharmacy, medicine) is what is shown."""

    __tablename__ = "pharmacy_inventory_snapshots"
    __table_args__ = (
        CheckConstraint(_in("availability", AVAILABILITIES), name="availability_valid"),
        CheckConstraint("price_amount IS NULL OR price_amount >= 0", name="price_non_negative"),
        CheckConstraint("(price_amount IS NULL) = (currency IS NULL)", name="price_has_currency"),
        Index(
            "ix_inventory_medicine_pharmacy_time",
            "medicine_id",
            "pharmacy_id",
            text("source_timestamp DESC"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    pharmacy_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("pharmacies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    medicine_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("medicines.id", ondelete="RESTRICT"), nullable=False
    )
    availability: Mapped[str] = mapped_column(String(16), nullable=False)
    price_amount: Mapped[float | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str | None] = mapped_column(String(3))
    pack_size_text: Mapped[str | None] = mapped_column(String(64))
    source_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("provider_sources.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    source_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Doctor(Base, TimestampMixin):
    __tablename__ = "doctors"
    __table_args__ = (
        CheckConstraint(_in("booking_mode", BOOKING_MODES), name="booking_mode_valid"),
        CheckConstraint("status IN ('active','retired')", name="status_valid"),
        CheckConstraint(
            "(latitude IS NULL) = (longitude IS NULL)", name="coordinates_both_or_neither"
        ),
        CheckConstraint(
            "latitude IS NULL OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)",
            name="coordinates_in_range",
        ),
        Index("ix_doctors_city_lower", text("lower(city)")),
        Index("ix_doctors_specialties", "specialties", postgresql_using="gin"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    clinic_name: Mapped[str | None] = mapped_column(Text)
    specialties: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, server_default=text("'{}'::text[]")
    )
    languages: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, server_default=text("'{}'::text[]")
    )
    address_line: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str] = mapped_column(Text, nullable=False)
    state: Mapped[str | None] = mapped_column(Text)
    postal_code: Mapped[str | None] = mapped_column(String(12))
    latitude: Mapped[float | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[float | None] = mapped_column(Numeric(9, 6))
    phone: Mapped[str | None] = mapped_column(String(24))
    booking_mode: Mapped[str] = mapped_column(String(16), nullable=False, default="request_only")
    source_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("provider_sources.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    source_observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")


class DoctorCredential(Base, TimestampMixin):
    """A qualification or registration. `verified` requires a verification source and time; a
    credential that only appears in the directory is `source_listed`, and one with neither is
    `unverified`. The registration number is stored but only ever shown masked."""

    __tablename__ = "doctor_credentials"
    __table_args__ = (
        CheckConstraint(_in("status", CREDENTIAL_STATUSES), name="status_valid"),
        CheckConstraint(
            "status <> 'verified' "
            "OR (verification_source_id IS NOT NULL AND verified_at IS NOT NULL)",
            name="verified_has_provenance",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    doctor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("doctors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    qualification: Mapped[str] = mapped_column(Text, nullable=False)
    registration_number: Mapped[str | None] = mapped_column(Text)
    issuing_authority: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="unverified")
    verification_source_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("provider_sources.id", ondelete="RESTRICT")
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Appointment(Base, TimestampMixin):
    """A patient's appointment request. `request_only` means it is recorded here and nothing was
    sent to the clinic. `confirmed` and `declined` exist only with a provider reference and
    response time, enforced by the database."""

    __tablename__ = "appointments"
    __table_args__ = (
        CheckConstraint(_in("mode", BOOKING_MODES), name="mode_valid"),
        CheckConstraint(_in("status", APPOINTMENT_STATUSES), name="status_valid"),
        CheckConstraint(_in("preferred_window", WINDOWS), name="window_valid"),
        CheckConstraint(
            "(mode = 'request_only' AND status IN ('request_only','cancelled')) "
            "OR (mode = 'provider' AND status IN ('sent','confirmed','declined','cancelled'))",
            name="status_matches_mode",
        ),
        CheckConstraint(
            "status NOT IN ('confirmed','declined') "
            "OR (provider_reference IS NOT NULL AND provider_responded_at IS NOT NULL)",
            name="response_needs_provider",
        ),
        Index("ix_appointments_patient_created", "patient_user_id", text("created_at DESC")),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    doctor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("doctors.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    preferred_date: Mapped[date] = mapped_column(Date, nullable=False)
    preferred_window: Mapped[str] = mapped_column(String(12), nullable=False, default="any")
    reason: Mapped[str | None] = mapped_column(Text)
    mode: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    provider_reference: Mapped[str | None] = mapped_column(Text)
    provider_responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    provider_message: Mapped[str | None] = mapped_column(Text)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
