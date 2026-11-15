"""Medication domain logic shared by the API and the notification worker."""

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.medications.models import (
    DoseLog,
    Medication,
    MedicationSchedule,
    MedicationSupply,
    Notification,
    Prescription,
)
from app.medications.schedule import ScheduleSpec, doses_per_day, occurrences
from app.medications.schemas import AlertOut
from app.patients.models import PatientProfile

HORIZON = timedelta(hours=48)  # how far ahead pending doses are materialised
LOOKBACK = timedelta(hours=6)  # recover slots missed while the worker was down
OVERDUE_AFTER = timedelta(minutes=60)  # a pending dose this late is shown as overdue
NOTIFY_WINDOW = timedelta(hours=24)  # never notify for doses older than this
EXPIRY_WARNING_DAYS = 30
FUTURE_SLACK = timedelta(minutes=5)  # tolerated client clock skew when logging a dose


def utcnow() -> datetime:
    return datetime.now(UTC)


def not_found() -> AppError:
    return AppError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.")


# --------------------------------------------------------------------------- ownership
def _owned(db: Session, model, resource_id: uuid.UUID, user):
    row = db.scalar(select(model).where(model.id == resource_id, model.patient_user_id == user.id))
    if row is None:
        raise not_found()
    return row


def owned_medication(db: Session, medication_id, user) -> Medication:
    return _owned(db, Medication, medication_id, user)


def owned_prescription(db: Session, prescription_id, user) -> Prescription:
    return _owned(db, Prescription, prescription_id, user)


def owned_schedule(db: Session, schedule_id, user) -> MedicationSchedule:
    return _owned(db, MedicationSchedule, schedule_id, user)


def owned_supply(db: Session, supply_id, user) -> MedicationSupply:
    return _owned(db, MedicationSupply, supply_id, user)


def owned_dose(db: Session, dose_id, user, lock: bool = False) -> DoseLog:
    stmt = select(DoseLog).where(DoseLog.id == dose_id, DoseLog.patient_user_id == user.id)
    if lock:
        stmt = stmt.with_for_update()
    row = db.scalar(stmt)
    if row is None:
        raise not_found()
    return row


def profile_timezone(db: Session, user_id) -> str:
    tz = db.scalar(select(PatientProfile.timezone).where(PatientProfile.user_id == user_id))
    return tz or "Asia/Kolkata"


# ---------------------------------------------------------------------------- schedules
def effective_spec(schedule: MedicationSchedule, medication: Medication) -> ScheduleSpec:
    """The schedule clipped to the medication's own start and end dates."""
    start = schedule.start_date
    if medication.start_date and medication.start_date > start:
        start = medication.start_date
    end = schedule.end_date
    if medication.end_date and (end is None or medication.end_date < end):
        end = medication.end_date
    return ScheduleSpec(
        timezone=schedule.timezone,
        times=tuple(schedule.times),
        start_date=start,
        end_date=end,
        days_of_week=tuple(schedule.days_of_week) if schedule.days_of_week is not None else None,
        every_n_days=schedule.every_n_days,
    )


def schedule_generates(schedule: MedicationSchedule, medication: Medication) -> bool:
    return schedule.is_active and medication.status == "active"


def generate_doses(
    db: Session, schedule: MedicationSchedule, medication: Medication, now: datetime
) -> int:
    """Materialise pending dose logs for [now - LOOKBACK, now + HORIZON). Idempotent: the
    unique (schedule, slot) constraint makes repeated calls insert nothing new.

    Slots earlier than the schedule's last edit are not created, so adding a 08:00 dose at
    14:00 never produces an instantly 'overdue' dose.
    """
    if not schedule_generates(schedule, medication):
        return 0
    start = max(now - LOOKBACK, schedule.updated_at or now)
    slots = occurrences(effective_spec(schedule, medication), start, now + HORIZON)
    if not slots:
        return 0
    stmt = (
        pg_insert(DoseLog)
        .values(
            [
                {
                    "id": uuid.uuid4(),
                    "patient_user_id": schedule.patient_user_id,
                    "medication_id": schedule.medication_id,
                    "schedule_id": schedule.id,
                    "scheduled_at": slot,
                    "status": "pending",
                }
                for slot in slots
            ]
        )
        .on_conflict_do_nothing(index_elements=["schedule_id", "scheduled_at"])
        .returning(DoseLog.id)
    )
    return len(db.execute(stmt).all())


def drop_future_pending(db: Session, schedule_id, now: datetime) -> int:
    """Remove not-yet-due pending doses (never taken or skipped ones) after a schedule edit,
    pause or stop. Their unread reminders go with them."""
    ids = list(
        db.scalars(
            select(DoseLog.id).where(
                DoseLog.schedule_id == schedule_id,
                DoseLog.status == "pending",
                DoseLog.scheduled_at > now,
            )
        )
    )
    if not ids:
        return 0
    db.execute(delete(Notification).where(Notification.dose_log_id.in_(ids)))
    db.execute(delete(DoseLog).where(DoseLog.id.in_(ids)))
    return len(ids)


def resync_medication(db: Session, medication: Medication, now: datetime) -> None:
    """Bring pending doses in line with the medication's current state."""
    schedules = db.scalars(
        select(MedicationSchedule).where(MedicationSchedule.medication_id == medication.id)
    ).all()
    for schedule in schedules:
        drop_future_pending(db, schedule.id, now)
        # Restart the clock so resuming never invents "overdue" doses for the paused period.
        schedule.updated_at = now
        db.flush()
        generate_doses(db, schedule, medication, now)


# ------------------------------------------------------------------------------- doses
def _dose_units(db: Session, dose: DoseLog) -> float:
    med = db.get(Medication, dose.medication_id)
    return float(med.units_per_dose) if med else 1.0


def consume_supply(db: Session, dose: DoseLog, taken_at: datetime) -> None:
    """Take stock from the usable supply that expires first (FEFO). Expired and empty supplies
    are skipped. If stock runs out mid-dose, only what was actually there is recorded."""
    units = _dose_units(db, dose)
    supply = db.scalar(
        select(MedicationSupply)
        .where(
            MedicationSupply.medication_id == dose.medication_id,
            MedicationSupply.patient_user_id == dose.patient_user_id,
            MedicationSupply.status == "active",
            MedicationSupply.quantity_remaining > 0,
            (MedicationSupply.expiry_date.is_(None))
            | (MedicationSupply.expiry_date >= taken_at.date()),
        )
        .order_by(MedicationSupply.expiry_date.asc().nulls_last(), MedicationSupply.created_at)
        .limit(1)
        .with_for_update()
    )
    if supply is None:
        dose.supply_id, dose.units_used = None, None
        return
    used = min(float(supply.quantity_remaining), units)
    supply.quantity_remaining = float(supply.quantity_remaining) - used
    dose.supply_id, dose.units_used = supply.id, used


def restore_supply(db: Session, dose: DoseLog) -> None:
    if dose.supply_id is not None and dose.units_used:
        supply = db.scalar(
            select(MedicationSupply).where(MedicationSupply.id == dose.supply_id).with_for_update()
        )
        if supply is not None:
            supply.quantity_remaining = float(supply.quantity_remaining) + float(dose.units_used)
    dose.supply_id, dose.units_used = None, None


def mark_taken(
    db: Session, dose: DoseLog, taken_at: datetime | None, note: str | None, now: datetime
) -> None:
    """The only code path that sets a dose to taken: an explicit patient action."""
    if dose.status == "taken":
        raise AppError(409, "DOSE_ALREADY_LOGGED", "This dose is already marked as taken.")
    when = taken_at or now
    if when > now + FUTURE_SLACK:
        raise AppError(422, "VALIDATION_ERROR", "You can't log a dose as taken in the future.")
    dose.status = "taken"
    dose.taken_at = when
    dose.note = note
    consume_supply(db, dose, when)
    read_dose_notifications(db, dose.id, now)


def mark_skipped(db: Session, dose: DoseLog, note: str | None, now: datetime) -> None:
    if dose.status != "pending":
        raise AppError(409, "DOSE_ALREADY_LOGGED", "Undo this dose first, then you can change it.")
    dose.status = "skipped"
    dose.note = note
    read_dose_notifications(db, dose.id, now)


def mark_pending(db: Session, dose: DoseLog) -> None:
    if dose.scheduled_at is None:
        raise AppError(409, "NOT_UNDOABLE", "An extra dose can only be deleted, not reset.")
    if dose.status == "pending":
        return
    restore_supply(db, dose)
    dose.status = "pending"
    dose.taken_at = None
    dose.note = None


def read_dose_notifications(db: Session, dose_id, now: datetime) -> None:
    for n in db.scalars(
        select(Notification).where(
            Notification.dose_log_id == dose_id, Notification.read_at.is_(None)
        )
    ):
        n.read_at = now


def is_overdue(dose: DoseLog, now: datetime) -> bool:
    return (
        dose.status == "pending"
        and dose.scheduled_at is not None
        and dose.scheduled_at + OVERDUE_AFTER < now
    )


# ------------------------------------------------------------------------------ alerts
@dataclass
class _Stock:
    usable: float  # remaining in active, unexpired supplies
    tracked: bool  # the patient has recorded at least one active supply


def _stock(supplies: list[MedicationSupply], today: date) -> _Stock:
    active = [s for s in supplies if s.status == "active"]
    usable = sum(
        float(s.quantity_remaining)
        for s in active
        if s.expiry_date is None or s.expiry_date >= today
    )
    return _Stock(usable=usable, tracked=bool(active))


def daily_units(schedules: list[MedicationSchedule], medication: Medication) -> float:
    total = 0.0
    for s in schedules:
        if s.is_active:
            total += doses_per_day(effective_spec(s, medication))
    return total * float(medication.units_per_dose)


def compute_alerts(db: Session, patient_user_id, today: date) -> list[AlertOut]:
    """Refill and expiry alerts derived live from supplies and schedules. The worker turns
    these same alerts into notifications, so the screen and the reminders always agree."""
    meds = db.scalars(
        select(Medication).where(
            Medication.patient_user_id == patient_user_id, Medication.status == "active"
        )
    ).all()
    out: list[AlertOut] = []
    for med in meds:
        if med.end_date and med.end_date < today:
            continue
        supplies = db.scalars(
            select(MedicationSupply).where(MedicationSupply.medication_id == med.id)
        ).all()
        schedules = db.scalars(
            select(MedicationSchedule).where(MedicationSchedule.medication_id == med.id)
        ).all()

        for s in supplies:
            if s.status != "active" or s.expiry_date is None or float(s.quantity_remaining) <= 0:
                continue
            if s.expiry_date < today:
                kind = "expired"
            elif s.expiry_date <= today + timedelta(days=EXPIRY_WARNING_DAYS):
                kind = "expiring_soon"
            else:
                continue
            out.append(
                AlertOut(
                    kind=kind,
                    medication_id=med.id,
                    medication_name=med.display_name,
                    supply_id=s.id,
                    lot_number=s.lot_number,
                    expiry_date=s.expiry_date,
                    remaining=float(s.quantity_remaining),
                )
            )

        stock = _stock(list(supplies), today)
        per_day = daily_units(list(schedules), med)
        if not stock.tracked or per_day <= 0:
            continue  # no stock recorded, or as-needed use: nothing to project
        if stock.usable <= 0:
            out.append(
                AlertOut(
                    kind="out_of_stock",
                    medication_id=med.id,
                    medication_name=med.display_name,
                    remaining=0,
                    days_left=0,
                )
            )
        else:
            days_left = stock.usable / per_day
            if days_left <= med.refill_threshold_days:
                out.append(
                    AlertOut(
                        kind="refill_soon",
                        medication_id=med.id,
                        medication_name=med.display_name,
                        remaining=stock.usable,
                        days_left=round(days_left, 1),
                    )
                )
    return out


def count_for(db: Session, model, user_id) -> int:
    stmt = select(func.count()).select_from(model).where(model.patient_user_id == user_id)
    return db.scalar(stmt) or 0
