import uuid
from datetime import date

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin

RECORD_TYPES = (
    "lab_report",
    "prescription",
    "imaging",
    "discharge_summary",
    "vaccination",
    "other",
)
LAB_FLAGS = ("low", "normal", "high", "unknown")

_VERIFICATION = (
    "verification_status IN ('patient_reported','clinician_confirmed','imported','unverified')"
)


class HealthRecord(Base, TimestampMixin):
    __tablename__ = "health_records"
    __table_args__ = (
        CheckConstraint(
            "record_type IN ('lab_report','prescription','imaging','discharge_summary',"
            "'vaccination','other')",
            name="type_valid",
        ),
        CheckConstraint("status IN ('active','entered_in_error')", name="status_valid"),
        CheckConstraint(_VERIFICATION, name="verification_valid"),
        Index("ix_health_records_patient_date", "patient_user_id", "record_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    record_type: Mapped[str] = mapped_column(String(24), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    record_date: Mapped[date | None] = mapped_column(Date)
    provider_name: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active")
    verification_status: Mapped[str] = mapped_column(
        String(24), nullable=False, default="patient_reported"
    )
    # Attached file (all null when no file). The key is a random storage key, not a path.
    file_key: Mapped[str | None] = mapped_column(String(32))
    file_name: Mapped[str | None] = mapped_column(Text)
    file_content_type: Mapped[str | None] = mapped_column(String(32))
    file_size: Mapped[int | None] = mapped_column(Integer)
    file_sha256: Mapped[str | None] = mapped_column(String(64))

    @property
    def has_file(self) -> bool:
        return self.file_key is not None


class LabResult(Base, TimestampMixin):
    __tablename__ = "lab_results"
    __table_args__ = (
        CheckConstraint("status IN ('active','entered_in_error')", name="status_valid"),
        CheckConstraint(_VERIFICATION, name="verification_valid"),
        CheckConstraint("flag IN ('low','normal','high','unknown')", name="flag_valid"),
        CheckConstraint("value_numeric IS NOT NULL OR value_text IS NOT NULL", name="has_value"),
        CheckConstraint(
            "ref_low IS NULL OR ref_high IS NULL OR ref_low <= ref_high", name="range_valid"
        ),
        Index("ix_lab_results_patient_test", "patient_user_id", "test_name", "observed_on"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    record_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("health_records.id", ondelete="RESTRICT"), index=True
    )
    test_name: Mapped[str] = mapped_column(Text, nullable=False)
    value_numeric: Mapped[float | None] = mapped_column(Numeric(14, 4))
    value_text: Mapped[str | None] = mapped_column(Text)
    unit: Mapped[str | None] = mapped_column(String(32))
    ref_low: Mapped[float | None] = mapped_column(Numeric(14, 4))
    ref_high: Mapped[float | None] = mapped_column(Numeric(14, 4))
    # Computed server-side from the value and the range printed on the report. It says
    # "outside the report's range", not "abnormal for this patient": never a diagnosis.
    flag: Mapped[str] = mapped_column(String(8), nullable=False, default="unknown")
    observed_on: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active")
    verification_status: Mapped[str] = mapped_column(
        String(24), nullable=False, default="patient_reported"
    )
