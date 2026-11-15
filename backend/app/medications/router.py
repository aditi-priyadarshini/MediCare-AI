import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Query, Request, Response
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.api.deps import AdminUser, CurrentUser, DbDep
from app.audit.service import record
from app.core.errors import AppError
from app.core.pagination import Page, PageDep
from app.medications import service as svc
from app.medications.models import (
    DoseLog,
    Medication,
    MedicationSchedule,
    MedicationSupply,
    Medicine,
    Notification,
    Prescription,
)
from app.medications.schemas import (
    AdHocDoseIn,
    AlertOut,
    DoseOut,
    DoseSkipIn,
    DoseStatus,
    DoseTakeIn,
    MedicationIn,
    MedicationOut,
    MedicationPatch,
    MedicationStatus,
    MedicineIn,
    MedicineOut,
    NotificationOut,
    PrescriptionIn,
    PrescriptionOut,
    PrescriptionPatch,
    ScheduleIn,
    ScheduleOut,
    SchedulePatch,
    SupplyIn,
    SupplyOut,
    SupplyPatch,
)
from app.records.service import owned_record_or_404

router = APIRouter(tags=["medications"])

MAX_MEDICATIONS = 100
MAX_PRESCRIPTIONS = 200
MAX_SCHEDULES_PER_MEDICATION = 10
MAX_SUPPLIES_PER_MEDICATION = 50
MAX_DOSE_WINDOW = timedelta(days=62)
REMAINING_TOO_HIGH = "Remaining cannot be more than the starting amount."

_MED_CONTENT = (
    "medicine_id",
    "prescription_id",
    "display_name",
    "strength_text",
    "form",
    "dose_text",
    "units_per_dose",
    "instructions",
    "reason",
    "as_needed",
    "start_date",
    "end_date",
)


def _audit(db: Session, action: str, request: Request, user, rtype: str, rid) -> None:
    record(db, action, request, actor_user_id=user.id, resource_type=rtype, resource_id=rid)


def _like_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _same(new, old) -> bool:
    """Equality that treats Decimal (from the database) and float (from JSON) alike."""
    if new is None or old is None:
        return new is old
    if isinstance(old, Decimal):
        return float(new) == float(old)
    return new == old


# ------------------------------------------------------------------------------ medicines
@router.get("/medicines", response_model=list[MedicineOut])
def search_medicines(
    user: CurrentUser,
    db: DbDep,
    q: Annotated[str, Query(min_length=2, max_length=50)],
):
    """Type-ahead over the shared catalogue. Names only: it never gives dosing advice."""
    needle = f"%{_like_escape(' '.join(q.split()).lower())}%"
    return db.scalars(
        select(Medicine)
        .where(func.lower(Medicine.name).like(needle, escape="\\"))
        .order_by(func.lower(Medicine.name), Medicine.strength_text)
        .limit(20)
    ).all()


@router.post("/admin/medicines", response_model=MedicineOut, status_code=201)
def admin_add_medicine(body: MedicineIn, request: Request, admin: AdminUser, db: DbDep):
    exists = db.scalar(
        select(Medicine.id).where(
            func.lower(Medicine.name) == body.name.lower(),
            Medicine.form.is_not_distinct_from(body.form),
            Medicine.strength_text.is_not_distinct_from(body.strength_text),
        )
    )
    if exists:
        raise AppError(409, "ALREADY_EXISTS", "That medicine is already in the catalogue.")
    row = Medicine(source="admin", **body.model_dump())
    db.add(row)
    db.flush()
    _audit(db, "admin.medicine_create", request, admin, "medicine", row.id)
    db.commit()
    return row


# --------------------------------------------------------------------------- prescriptions
@router.get("/prescriptions", response_model=Page[PrescriptionOut])
def list_prescriptions(user: CurrentUser, db: DbDep, params: PageDep):
    base = select(Prescription).where(
        Prescription.patient_user_id == user.id, Prescription.status == "active"
    )
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    items = db.scalars(
        base.order_by(
            Prescription.prescribed_on.desc().nulls_last(), Prescription.created_at.desc()
        )
        .limit(params.limit)
        .offset(params.offset)
    ).all()
    return {"items": items, "total": total, "limit": params.limit, "offset": params.offset}


@router.post("/prescriptions", response_model=PrescriptionOut, status_code=201)
def create_prescription(body: PrescriptionIn, request: Request, user: CurrentUser, db: DbDep):
    if svc.count_for(db, Prescription, user.id) >= MAX_PRESCRIPTIONS:
        raise AppError(
            409, "LIMIT_REACHED", f"You can save up to {MAX_PRESCRIPTIONS} prescriptions."
        )
    if body.record_id is not None:
        owned_record_or_404(db, body.record_id, user)
    row = Prescription(
        patient_user_id=user.id, verification_status="patient_reported", **body.model_dump()
    )
    db.add(row)
    db.flush()
    _audit(db, "prescription.create", request, user, "prescription", row.id)
    db.commit()
    return row


@router.get("/prescriptions/{prescription_id}", response_model=PrescriptionOut)
def get_prescription(prescription_id: uuid.UUID, user: CurrentUser, db: DbDep):
    return svc.owned_prescription(db, prescription_id, user)


@router.patch("/prescriptions/{prescription_id}", response_model=PrescriptionOut)
def update_prescription(
    prescription_id: uuid.UUID,
    body: PrescriptionPatch,
    request: Request,
    user: CurrentUser,
    db: DbDep,
):
    row = svc.owned_prescription(db, prescription_id, user)
    data = body.model_dump(exclude_unset=True)
    if "status" in data and data["status"] is None:
        raise AppError(422, "VALIDATION_ERROR", "status cannot be empty.")
    if data.get("record_id") is not None:
        owned_record_or_404(db, data["record_id"], user)
    content = ("record_id", "prescriber_name", "prescribed_on", "valid_until", "notes")
    if any(k in data and data[k] != getattr(row, k) for k in content):
        row.verification_status = "patient_reported"
    for key, value in data.items():
        setattr(row, key, value)
    if row.valid_until and row.prescribed_on and row.valid_until < row.prescribed_on:
        raise AppError(422, "VALIDATION_ERROR", "Valid-until cannot be before the prescribed date.")
    _audit(db, "prescription.update", request, user, "prescription", row.id)
    db.commit()
    return row


# ----------------------------------------------------------------------------- medications
def _resolve_links(db: Session, user, data: dict) -> None:
    """Validate catalogue and prescription references and derive `basis`."""
    if data.get("medicine_id") is not None:
        if db.get(Medicine, data["medicine_id"]) is None:
            raise AppError(422, "VALIDATION_ERROR", "That medicine is not in the catalogue.")
    if "prescription_id" in data:
        if data["prescription_id"] is not None:
            rx = svc.owned_prescription(db, data["prescription_id"], user)
            if rx.status != "active":
                raise AppError(422, "VALIDATION_ERROR", "That prescription was marked as an error.")
            data["basis"] = "prescribed"
        else:
            data["basis"] = "self_reported"


@router.get("/medications/alerts", response_model=list[AlertOut])
def medication_alerts(user: CurrentUser, db: DbDep):
    return svc.compute_alerts(db, user.id, svc.utcnow().date())


@router.get("/medications", response_model=Page[MedicationOut])
def list_medications(
    user: CurrentUser,
    db: DbDep,
    params: PageDep,
    status: Annotated[MedicationStatus | None, Query()] = None,
    include_inactive: Annotated[bool, Query()] = False,
):
    base = select(Medication).where(Medication.patient_user_id == user.id)
    if status:
        base = base.where(Medication.status == status)
    elif not include_inactive:
        base = base.where(Medication.status.in_(("active", "paused")))
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    items = db.scalars(
        base.order_by(func.lower(Medication.display_name), Medication.created_at)
        .limit(params.limit)
        .offset(params.offset)
    ).all()
    return {"items": items, "total": total, "limit": params.limit, "offset": params.offset}


@router.post("/medications", response_model=MedicationOut, status_code=201)
def create_medication(body: MedicationIn, request: Request, user: CurrentUser, db: DbDep):
    if svc.count_for(db, Medication, user.id) >= MAX_MEDICATIONS:
        raise AppError(409, "LIMIT_REACHED", f"You can track up to {MAX_MEDICATIONS} medications.")
    data = body.model_dump()
    data.setdefault("prescription_id", None)
    _resolve_links(db, user, data)
    row = Medication(patient_user_id=user.id, verification_status="patient_reported", **data)
    db.add(row)
    db.flush()
    _audit(db, "medication.create", request, user, "medication", row.id)
    db.commit()
    return row


@router.get("/medications/{medication_id}", response_model=MedicationOut)
def get_medication(medication_id: uuid.UUID, user: CurrentUser, db: DbDep):
    return svc.owned_medication(db, medication_id, user)


@router.patch("/medications/{medication_id}", response_model=MedicationOut)
def update_medication(
    medication_id: uuid.UUID,
    body: MedicationPatch,
    request: Request,
    user: CurrentUser,
    db: DbDep,
):
    row = svc.owned_medication(db, medication_id, user)
    data = body.model_dump(exclude_unset=True)
    required_fields = ("display_name", "units_per_dose", "as_needed", "status")
    for required in (*required_fields, "refill_threshold_days"):
        if required in data and data[required] is None:
            raise AppError(422, "VALIDATION_ERROR", f"{required} cannot be empty.")
    _resolve_links(db, user, data)
    if any(k in data and not _same(data[k], getattr(row, k)) for k in _MED_CONTENT):
        row.verification_status = "patient_reported"
    for key, value in data.items():
        setattr(row, key, value)
    if row.start_date and row.end_date and row.end_date < row.start_date:
        raise AppError(422, "VALIDATION_ERROR", "End date cannot be before the start date.")
    db.flush()
    if data.keys() & {"status", "start_date", "end_date"}:
        # Pausing, stopping or changing dates changes which doses should exist from now on.
        svc.resync_medication(db, row, svc.utcnow())
    _audit(db, "medication.update", request, user, "medication", row.id)
    db.commit()
    return row


# -------------------------------------------------------------------------------- schedules
@router.get("/medications/{medication_id}/schedules", response_model=list[ScheduleOut])
def list_schedules(medication_id: uuid.UUID, user: CurrentUser, db: DbDep):
    svc.owned_medication(db, medication_id, user)
    return db.scalars(
        select(MedicationSchedule)
        .where(MedicationSchedule.medication_id == medication_id)
        .order_by(MedicationSchedule.created_at)
    ).all()


@router.post(
    "/medications/{medication_id}/schedules", response_model=ScheduleOut, status_code=201
)
def create_schedule(
    medication_id: uuid.UUID, body: ScheduleIn, request: Request, user: CurrentUser, db: DbDep
):
    med = svc.owned_medication(db, medication_id, user)
    if med.status not in ("active", "paused"):
        raise AppError(409, "MEDICATION_INACTIVE", "This medication is no longer being tracked.")
    count = db.scalar(
        select(func.count())
        .select_from(MedicationSchedule)
        .where(MedicationSchedule.medication_id == med.id)
    )
    if (count or 0) >= MAX_SCHEDULES_PER_MEDICATION:
        raise AppError(
            409, "LIMIT_REACHED", f"Up to {MAX_SCHEDULES_PER_MEDICATION} schedules per medication."
        )
    data = body.model_dump()
    data["timezone"] = data["timezone"] or svc.profile_timezone(db, user.id)
    row = MedicationSchedule(patient_user_id=user.id, medication_id=med.id, is_active=True, **data)
    db.add(row)
    db.flush()
    svc.generate_doses(db, row, med, svc.utcnow())
    _audit(db, "schedule.create", request, user, "medication_schedule", row.id)
    db.commit()
    return row


@router.patch("/schedules/{schedule_id}", response_model=ScheduleOut)
def update_schedule(
    schedule_id: uuid.UUID, body: SchedulePatch, request: Request, user: CurrentUser, db: DbDep
):
    row = svc.owned_schedule(db, schedule_id, user)
    data = body.model_dump(exclude_unset=True)
    for required in ("times", "every_n_days", "start_date", "timezone", "is_active"):
        if required in data and data[required] is None:
            raise AppError(422, "VALIDATION_ERROR", f"{required} cannot be empty.")
    for key, value in data.items():
        setattr(row, key, value)
    if row.end_date and row.end_date < row.start_date:
        raise AppError(422, "VALIDATION_ERROR", "End date cannot be before the start date.")
    if row.every_n_days > 1 and row.days_of_week is not None:
        raise AppError(
            422, "VALIDATION_ERROR", "Choose either specific weekdays or every N days, not both."
        )
    db.flush()
    now = svc.utcnow()
    med = db.get(Medication, row.medication_id)
    svc.drop_future_pending(db, row.id, now)
    svc.generate_doses(db, row, med, now)
    _audit(db, "schedule.update", request, user, "medication_schedule", row.id)
    db.commit()
    return row


# ---------------------------------------------------------------------------------- supplies
@router.get("/medications/{medication_id}/supplies", response_model=list[SupplyOut])
def list_supplies(
    medication_id: uuid.UUID,
    user: CurrentUser,
    db: DbDep,
    include_inactive: Annotated[bool, Query()] = False,
):
    svc.owned_medication(db, medication_id, user)
    stmt = select(MedicationSupply).where(MedicationSupply.medication_id == medication_id)
    if not include_inactive:
        stmt = stmt.where(MedicationSupply.status == "active")
    return db.scalars(
        stmt.order_by(MedicationSupply.expiry_date.asc().nulls_last(), MedicationSupply.created_at)
    ).all()


@router.post("/medications/{medication_id}/supplies", response_model=SupplyOut, status_code=201)
def create_supply(
    medication_id: uuid.UUID, body: SupplyIn, request: Request, user: CurrentUser, db: DbDep
):
    med = svc.owned_medication(db, medication_id, user)
    count = db.scalar(
        select(func.count())
        .select_from(MedicationSupply)
        .where(MedicationSupply.medication_id == med.id)
    )
    if (count or 0) >= MAX_SUPPLIES_PER_MEDICATION:
        raise AppError(409, "LIMIT_REACHED", f"Up to {MAX_SUPPLIES_PER_MEDICATION} supplies each.")
    data = body.model_dump()
    if data["quantity_remaining"] is None:
        data["quantity_remaining"] = data["quantity_initial"]
    if data["quantity_remaining"] > data["quantity_initial"]:
        raise AppError(422, "VALIDATION_ERROR", REMAINING_TOO_HIGH)
    row = MedicationSupply(patient_user_id=user.id, medication_id=med.id, status="active", **data)
    db.add(row)
    db.flush()
    _audit(db, "supply.create", request, user, "medication_supply", row.id)
    db.commit()
    return row


@router.patch("/supplies/{supply_id}", response_model=SupplyOut)
def update_supply(
    supply_id: uuid.UUID, body: SupplyPatch, request: Request, user: CurrentUser, db: DbDep
):
    row = svc.owned_supply(db, supply_id, user)
    data = body.model_dump(exclude_unset=True)
    if "status" in data and data["status"] is None:
        raise AppError(422, "VALIDATION_ERROR", "status cannot be empty.")
    if "quantity_remaining" in data and data["quantity_remaining"] is None:
        raise AppError(422, "VALIDATION_ERROR", "quantity_remaining cannot be empty.")
    for key, value in data.items():
        setattr(row, key, value)
    if float(row.quantity_remaining) > float(row.quantity_initial):
        raise AppError(422, "VALIDATION_ERROR", REMAINING_TOO_HIGH)
    _audit(db, "supply.update", request, user, "medication_supply", row.id)
    db.commit()
    return row


# ------------------------------------------------------------------------------------ doses
def _dose_out(dose: DoseLog, name: str | None, dose_text: str | None, now: datetime) -> DoseOut:
    out = DoseOut.model_validate(dose)
    out.overdue = svc.is_overdue(dose, now)
    out.medication_name = name
    out.dose_text = dose_text
    return out


def _one_dose(db: Session, dose_id, user) -> tuple[DoseLog, str | None, str | None]:
    dose = svc.owned_dose(db, dose_id, user, lock=True)
    med = db.get(Medication, dose.medication_id)
    return dose, med.display_name if med else None, med.dose_text if med else None


@router.get("/doses", response_model=Page[DoseOut])
def list_doses(
    user: CurrentUser,
    db: DbDep,
    params: PageDep,
    date_from: Annotated[datetime | None, Query(alias="from")] = None,
    date_to: Annotated[datetime | None, Query(alias="to")] = None,
    medication_id: Annotated[uuid.UUID | None, Query()] = None,
    status: Annotated[DoseStatus | None, Query()] = None,
):
    """Doses in a time window (default: from 24 hours ago to 24 hours ahead), oldest first.
    Ad-hoc doses are placed by when they were taken."""
    now = svc.utcnow()
    start = date_from or now - timedelta(hours=24)
    end = date_to or now + timedelta(hours=24)
    if start.tzinfo is None:
        start = start.replace(tzinfo=now.tzinfo)
    if end.tzinfo is None:
        end = end.replace(tzinfo=now.tzinfo)
    if end <= start or end - start > MAX_DOSE_WINDOW:
        raise AppError(422, "VALIDATION_ERROR", "Choose a time range of up to 62 days.")
    when = func.coalesce(DoseLog.scheduled_at, DoseLog.taken_at)
    base = (
        select(DoseLog, Medication.display_name, Medication.dose_text)
        .join(Medication, Medication.id == DoseLog.medication_id)
        .where(DoseLog.patient_user_id == user.id, when >= start, when < end)
    )
    if medication_id:
        base = base.where(DoseLog.medication_id == medication_id)
    if status:
        base = base.where(DoseLog.status == status)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.execute(
        base.order_by(when, DoseLog.created_at).limit(params.limit).offset(params.offset)
    ).all()
    return {
        "items": [_dose_out(d, n, t, now) for d, n, t in rows],
        "total": total,
        "limit": params.limit,
        "offset": params.offset,
    }


@router.post("/doses", response_model=DoseOut, status_code=201)
def log_extra_dose(body: AdHocDoseIn, request: Request, user: CurrentUser, db: DbDep):
    """Log a dose that was not scheduled (for example an as-needed tablet)."""
    med = svc.owned_medication(db, body.medication_id, user)
    if med.status == "entered_in_error":
        raise AppError(409, "MEDICATION_INACTIVE", "This medication was marked as an error.")
    now = svc.utcnow()
    dose = DoseLog(id=uuid.uuid4(), patient_user_id=user.id, medication_id=med.id, status="pending")
    db.add(dose)
    svc.mark_taken(db, dose, body.taken_at, body.note, now)
    db.flush()
    _audit(db, "dose.log_extra", request, user, "dose_log", dose.id)
    db.commit()
    return _dose_out(dose, med.display_name, med.dose_text, now)


@router.post("/doses/{dose_id}/take", response_model=DoseOut)
def take_dose(
    dose_id: uuid.UUID, body: DoseTakeIn, request: Request, user: CurrentUser, db: DbDep
):
    dose, name, text_ = _one_dose(db, dose_id, user)
    now = svc.utcnow()
    svc.mark_taken(db, dose, body.taken_at, body.note, now)
    _audit(db, "dose.take", request, user, "dose_log", dose.id)
    db.commit()
    return _dose_out(dose, name, text_, now)


@router.post("/doses/{dose_id}/skip", response_model=DoseOut)
def skip_dose(
    dose_id: uuid.UUID, body: DoseSkipIn, request: Request, user: CurrentUser, db: DbDep
):
    dose, name, text_ = _one_dose(db, dose_id, user)
    now = svc.utcnow()
    svc.mark_skipped(db, dose, body.note, now)
    _audit(db, "dose.skip", request, user, "dose_log", dose.id)
    db.commit()
    return _dose_out(dose, name, text_, now)


@router.post("/doses/{dose_id}/reset", response_model=DoseOut)
def reset_dose(dose_id: uuid.UUID, request: Request, user: CurrentUser, db: DbDep):
    """Undo a mistaken 'taken' or 'skipped'. Returns any stock the dose used."""
    dose, name, text_ = _one_dose(db, dose_id, user)
    svc.mark_pending(db, dose)
    _audit(db, "dose.reset", request, user, "dose_log", dose.id)
    db.commit()
    return _dose_out(dose, name, text_, svc.utcnow())


@router.delete("/doses/{dose_id}", status_code=204)
def delete_extra_dose(dose_id: uuid.UUID, request: Request, user: CurrentUser, db: DbDep):
    """Remove a mistaken extra dose. Scheduled doses are reset, never deleted."""
    dose = svc.owned_dose(db, dose_id, user, lock=True)
    if dose.scheduled_at is not None:
        raise AppError(409, "NOT_DELETABLE", "Scheduled doses can be reset but not deleted.")
    svc.restore_supply(db, dose)
    db.execute(
        update(Notification).where(Notification.dose_log_id == dose.id).values(dose_log_id=None)
    )
    db.delete(dose)
    _audit(db, "dose.delete_extra", request, user, "dose_log", dose_id)
    db.commit()
    return Response(status_code=204)


# ---------------------------------------------------------------------------- notifications
@router.get("/notifications/unread-count")
def unread_count(user: CurrentUser, db: DbDep) -> dict[str, int]:
    count = db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(
            Notification.patient_user_id == user.id,
            Notification.due_at <= svc.utcnow(),
            Notification.read_at.is_(None),
        )
    )
    return {"count": count or 0}


@router.get("/notifications", response_model=Page[NotificationOut])
def list_notifications(
    user: CurrentUser,
    db: DbDep,
    params: PageDep,
    unread_only: Annotated[bool, Query()] = False,
):
    """Reminders that are due now or earlier, newest first."""
    base = select(Notification).where(
        Notification.patient_user_id == user.id, Notification.due_at <= svc.utcnow()
    )
    if unread_only:
        base = base.where(Notification.read_at.is_(None))
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    items = db.scalars(
        base.order_by(Notification.due_at.desc(), Notification.id)
        .limit(params.limit)
        .offset(params.offset)
    ).all()
    return {"items": items, "total": total, "limit": params.limit, "offset": params.offset}


@router.post("/notifications/read-all", status_code=204)
def read_all_notifications(user: CurrentUser, db: DbDep):
    now = svc.utcnow()
    db.execute(
        update(Notification)
        .where(
            Notification.patient_user_id == user.id,
            Notification.due_at <= now,
            Notification.read_at.is_(None),
        )
        .values(read_at=now)
    )
    db.commit()
    return Response(status_code=204)


@router.post("/notifications/{notification_id}/read", response_model=NotificationOut)
def read_notification(notification_id: uuid.UUID, user: CurrentUser, db: DbDep):
    row = db.scalar(
        select(Notification).where(
            Notification.id == notification_id, Notification.patient_user_id == user.id
        )
    )
    if row is None:
        raise svc.not_found()
    if row.read_at is None:
        row.read_at = svc.utcnow()
        db.commit()
    return row
