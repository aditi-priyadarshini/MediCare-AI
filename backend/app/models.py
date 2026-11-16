"""Phase 4 reference data (sources, ingredients, curated rules, prices) and patient ADR reports.

Reference data is shared and admin-curated; adverse event reports are patient-owned. Rules are
never edited in place: an admin retires a rule and creates a new one, so earlier versions stay
auditable.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
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

SEVERITIES = ("unknown", "minor", "moderate", "major", "contraindicated")
RULE_KINDS = ("drug_drug", "drug_food", "drug_condition")
ADR_SEVERITIES = ("mild", "moderate", "severe")
ADR_OUTCOMES = ("recovered", "ongoing", "unknown")


class ReferenceSource(Base):
    """Where a piece of reference data came from, with its version and review date."""

    __tablename__ = "reference_sources"
    __table_args__ = (UniqueConstraint("name", "version", name="uq_reference_sources_identity"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    publisher: Mapped[str | None] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(Text)
    licence: Mapped[str | None] = mapped_column(Text)
    jurisdiction: Mapped[str] = mapped_column(String(16), nullable=False)
    version: Mapped[str] = mapped_column(String(32), nullable=False)
    reviewed_at: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ActiveIngredient(Base):
    __tablename__ = "active_ingredients"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_name: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    drug_class: Mapped[str | None] = mapped_column(Text)
    # Curated words a patient might write in an allergy ("penicillin", "nsaid").
    allergy_terms: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, server_default=text("'{}'::text[]")
    )
    source_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("reference_sources.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class MedicineIngredient(Base):
    __tablename__ = "medicine_ingredients"

    medicine_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("medicines.id", ondelete="CASCADE"), primary_key=True
    )
    ingredient_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("active_ingredients.id", ondelete="RESTRICT"), primary_key=True, index=True
    )
    strength_value: Mapped[float | None] = mapped_column(Numeric(12, 4))
    strength_unit: Mapped[str | None] = mapped_column(String(16))


class SafetyRule(Base):
    """One curated statement. drug_drug rules pair two ingredients in canonical order
    (ingredient_id < counterpart_ingredient_id); food and condition rules carry a term."""

    __tablename__ = "safety_rules"
    __table_args__ = (
        CheckConstraint("kind IN ('drug_drug','drug_food','drug_condition')", name="kind_valid"),
        CheckConstraint(
            "severity IN ('unknown','minor','moderate','major','contraindicated')",
            name="severity_valid",
        ),
        CheckConstraint("status IN ('active','retired')", name="status_valid"),
        CheckConstraint("review_status IN ('unreviewed','approved')", name="review_status_valid"),
        CheckConstraint("version >= 1", name="version_positive"),
        CheckConstraint(
            "review_status = 'unreviewed' OR (reviewed_by_user_id IS NOT NULL "
            "AND peer_reviewed_at IS NOT NULL "
            "AND reviewed_by_user_id IS DISTINCT FROM created_by_user_id)",
            name="review_is_second_person",
        ),
        CheckConstraint(
            "(kind = 'drug_drug' AND counterpart_ingredient_id IS NOT NULL "
            "AND counterpart_term IS NULL AND ingredient_id < counterpart_ingredient_id) "
            "OR (kind <> 'drug_drug' AND counterpart_ingredient_id IS NULL "
            "AND counterpart_term IS NOT NULL)",
            name="shape_matches_kind",
        ),
        Index(
            "uq_safety_rules_active_pair",
            "ingredient_id",
            "counterpart_ingredient_id",
            "source_id",
            "source_version",
            unique=True,
            postgresql_where=text("kind = 'drug_drug' AND status = 'active'"),
        ),
        Index(
            "uq_safety_rules_active_term",
            "kind",
            "ingredient_id",
            "counterpart_term",
            "source_id",
            "source_version",
            unique=True,
            postgresql_where=text("kind <> 'drug_drug' AND status = 'active'"),
        ),
        Index("ix_safety_rules_lookup", "kind", "status", "ingredient_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    ingredient_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("active_ingredients.id", ondelete="RESTRICT"), nullable=False
    )
    counterpart_ingredient_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("active_ingredients.id", ondelete="RESTRICT"), index=True
    )
    counterpart_term: Mapped[str | None] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    clinical_significance: Mapped[str | None] = mapped_column(Text)
    guidance: Mapped[str | None] = mapped_column(Text)
    source_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("reference_sources.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    source_version: Mapped[str] = mapped_column(String(32), nullable=False)
    reviewed_at: Mapped[date] = mapped_column(Date, nullable=False)
    jurisdiction: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(8), nullable=False, default="active")
    retired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # Versioning: a change is a new row that supersedes the old one, which is retired.
    version: Mapped[int] = mapped_column(nullable=False, default=1, server_default="1")
    supersedes_rule_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("safety_rules.id", ondelete="RESTRICT"), index=True
    )
    # Second-person review: preferred, not required to be live. The reviewer cannot be the author.
    review_status: Mapped[str] = mapped_column(
        String(12), nullable=False, default="unreviewed", server_default="unreviewed"
    )
    reviewed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    peer_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class MedicinePrice(Base):
    """A price observed by a named source at a known time, for a known pack."""

    __tablename__ = "medicine_prices"
    __table_args__ = (
        CheckConstraint("price > 0", name="price_positive"),
        CheckConstraint("pack_quantity > 0", name="pack_positive"),
        Index("ix_medicine_prices_medicine", "medicine_id", "observed_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    medicine_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("medicines.id", ondelete="CASCADE"), nullable=False
    )
    source_name: Mapped[str] = mapped_column(Text, nullable=False)
    price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    pack_quantity: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    pack_unit: Mapped[str] = mapped_column(String(16), nullable=False)
    jurisdiction: Mapped[str] = mapped_column(String(16), nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class AdverseEventReport(Base, TimestampMixin):
    """A patient's description of a possible reaction. It records what was reported; it never
    asserts that a medicine caused it."""

    __tablename__ = "adverse_event_reports"
    __table_args__ = (
        CheckConstraint("severity IN ('mild','moderate','severe')", name="severity_valid"),
        CheckConstraint("outcome IN ('recovered','ongoing','unknown')", name="outcome_valid"),
        CheckConstraint("status IN ('submitted','entered_in_error')", name="status_valid"),
        Index("ix_adverse_event_reports_patient", "patient_user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    medication_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("medications.id", ondelete="RESTRICT"), index=True
    )
    medication_name: Mapped[str] = mapped_column(Text, nullable=False)  # as typed or snapshotted
    reaction: Mapped[str] = mapped_column(Text, nullable=False)
    onset_date: Mapped[date | None] = mapped_column(Date)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    outcome: Mapped[str] = mapped_column(String(16), nullable=False, default="unknown")
    notes: Mapped[str | None] = mapped_column(Text)
    record_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("health_records.id", ondelete="RESTRICT"), index=True
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="submitted")
