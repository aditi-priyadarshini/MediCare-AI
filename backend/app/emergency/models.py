import uuid

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin

SIMULATION_FLOW = ("requested", "acknowledged", "en_route", "arrived")
SIMULATION_STATUSES = (*SIMULATION_FLOW, "cancelled")


class EmergencySettings(Base, TimestampMixin):
    """What the patient allows on their emergency summary. Defaults are the minimum useful set."""

    __tablename__ = "emergency_settings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), unique=True, nullable=False
    )
    include_blood_group: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    include_allergies: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    include_conditions: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    include_medications: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    include_contacts: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class EmergencySimulation(Base, TimestampMixin):
    """A practice run of the ambulance flow. It never contacts anyone.

    The database refuses any row whose mode is not 'simulated', so this table can never hold
    something that looks like a real dispatch. Real dispatch needs a provider adapter that
    accepts the request (see providers.py) and is not stored here.
    """

    __tablename__ = "emergency_simulations"
    __table_args__ = (
        CheckConstraint("mode = 'simulated'", name="mode_simulated"),
        CheckConstraint(
            "status IN ('requested','acknowledged','en_route','arrived','cancelled')",
            name="status_valid",
        ),
        Index("ix_emergency_simulations_patient_created", "patient_user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    mode: Mapped[str] = mapped_column(String(16), nullable=False, default="simulated")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="requested")
    # Only whether the patient chose to include location. The coordinates are never stored.
    location_shared: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    history: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
