from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.records.models import HealthRecord, LabResult


def compute_flag(value: float | None, low: float | None, high: float | None) -> str:
    """Compare a numeric value with the reference range printed on the report."""
    if value is None or (low is None and high is None):
        return "unknown"
    if low is not None and value < low:
        return "low"
    if high is not None and value > high:
        return "high"
    return "normal"


def apply_flag(row: LabResult) -> None:
    row.flag = compute_flag(
        float(row.value_numeric) if row.value_numeric is not None else None,
        float(row.ref_low) if row.ref_low is not None else None,
        float(row.ref_high) if row.ref_high is not None else None,
    )


def validate_lab_state(row: LabResult) -> None:
    """Cross-field rules on the merged row (used by create and patch alike)."""
    if row.value_numeric is None and not row.value_text:
        raise AppError(422, "VALIDATION_ERROR", "Enter a value for this test.")
    if (
        row.ref_low is not None
        and row.ref_high is not None
        and float(row.ref_low) > float(row.ref_high)
    ):
        raise AppError(422, "VALIDATION_ERROR", "Reference low cannot be above reference high.")


def owned_record_or_404(db: Session, record_id, user) -> HealthRecord:
    row = db.scalar(
        select(HealthRecord).where(
            HealthRecord.id == record_id, HealthRecord.patient_user_id == user.id
        )
    )
    if row is None:
        raise AppError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.")
    return row
