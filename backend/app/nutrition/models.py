"""Phase 7 diet preferences and educational plans (patient-owned)."""

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
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin

DIET_TYPES = ("no_restriction", "vegetarian", "eggetarian", "pescatarian", "vegan", "jain")
CUISINES = ("general", "north_indian", "south_indian", "east_indian", "western_indian")
SITUATIONS = (
    "pregnant_or_breastfeeding",
    "kidney_disease",
    "eating_disorder_history",
    "child_under_12",
    "clinician_diet",
)


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class DietPreference(Base, TimestampMixin):
    __tablename__ = "diet_preferences"
    __table_args__ = (
        CheckConstraint(_in("diet_type", DIET_TYPES), name="diet_type_valid"),
        CheckConstraint(_in("cuisine", CUISINES), name="cuisine_valid"),
        CheckConstraint("meals_per_day BETWEEN 2 AND 5", name="meals_valid"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), unique=True, nullable=False
    )
    diet_type: Mapped[str] = mapped_column(String(16), nullable=False)
    cuisine: Mapped[str] = mapped_column(String(16), nullable=False)
    meals_per_day: Mapped[int] = mapped_column(Integer, nullable=False)
    avoid_foods: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, server_default=text("'{}'::text[]")
    )
    situations: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, server_default=text("'{}'::text[]")
    )


class DietPlan(Base):
    """A generated plan, stored with the exact constraints and flags it was built from."""

    __tablename__ = "diet_plans"
    __table_args__ = (
        Index("ix_diet_plans_patient_created", "patient_user_id", text("created_at DESC")),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    constraints_used: Mapped[dict] = mapped_column(JSONB, nullable=False)
    review_flags: Mapped[list] = mapped_column(JSONB, nullable=False)
    days: Mapped[list] = mapped_column(JSONB, nullable=False)
    catalogue_version: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
