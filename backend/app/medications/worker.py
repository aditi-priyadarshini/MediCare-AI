"""Notification worker: one idempotent `tick` that can run as often as you like.

Each step is safe to repeat. Dose slots are protected by a unique (schedule, slot) constraint
and notifications by a unique (patient, dedupe_key) constraint, with INSERT .. ON CONFLICT DO
NOTHING, so two overlapping workers or a retried tick never create duplicates.

The worker never marks a dose as taken. Only a patient action does (see service.mark_taken).
"""

import logging
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.calls import worker as call_worker
from app.calls.push import PushProvider
from app.core.config import Settings
from app.identity.models import User
from app.identity.providers import EmailProvider
from app.medications import service as svc
from app.medications.models import (
    DoseLog,
    Medication,
    MedicationSchedule,
    Notification,
)
from app.patients.models import UserConsent

log = logging.getLogger("app.worker")

EMAIL_RETRY_WINDOW = timedelta(hours=1)


@dataclass
class TickStats:
    doses_created: int = 0
    notifications_created: int = 0
    delivered: int = 0
    emails_sent: int = 0
    calls_rung: int = 0
    calls_failed: int = 0


def _insert_notifications(db: Session, rows: list[dict]) -> int:
    created = 0
    for i in range(0, len(rows), 500):  # keep each statement well under the parameter limit
        stmt = (
            pg_insert(Notification)
            .values(rows[i : i + 500])
            .on_conflict_do_nothing(index_elements=["patient_user_id", "dedupe_key"])
            .returning(Notification.id)
        )
        created += len(db.execute(stmt).all())
    return created


def generate_all_doses(db: Session, now: datetime) -> int:
    pairs = db.execute(
        select(MedicationSchedule, Medication)
        .join(Medication, Medication.id == MedicationSchedule.medication_id)
        .where(MedicationSchedule.is_active.is_(True), Medication.status == "active")
    ).all()
    return sum(svc.generate_doses(db, sched, med, now) for sched, med in pairs)


def create_dose_notifications(db: Session, now: datetime) -> int:
    rows = db.execute(
        select(DoseLog, Medication)
        .join(Medication, Medication.id == DoseLog.medication_id)
        .where(
            DoseLog.status == "pending",
            DoseLog.scheduled_at <= now,
            DoseLog.scheduled_at > now - svc.NOTIFY_WINDOW,
            Medication.status == "active",
        )
    ).all()
    payload = [
        {
            "id": uuid.uuid4(),
            "patient_user_id": dose.patient_user_id,
            "kind": "dose_due",
            "dedupe_key": f"dose:{dose.id}",
            "title": f"Time to take {med.display_name}",
            "body": "Open MediCare AI and confirm once you have taken it. "
            "It stays pending until you do.",
            "due_at": dose.scheduled_at,
            "dose_log_id": dose.id,
            "medication_id": med.id,
        }
        for dose, med in rows
    ]
    return _insert_notifications(db, payload)


def create_alert_notifications(db: Session, now: datetime) -> int:
    """Refill and expiry notifications from the same alert logic the screen uses. Refill and
    out-of-stock reminders repeat once per ISO week while the problem persists; expiry
    reminders are sent once per supply."""
    today = now.date()
    iso = now.isocalendar()
    week = f"{iso.year}-W{iso.week:02d}"
    patients = db.scalars(
        select(Medication.patient_user_id).where(Medication.status == "active").distinct()
    ).all()
    payload: list[dict] = []
    for patient_id in patients:
        for a in svc.compute_alerts(db, patient_id, today):
            if a.kind == "refill_soon":
                key = f"refill:{a.medication_id}:{week}"
                title = f"{a.medication_name} is running low"
                body = f"About {a.days_left:g} days of supply left. Plan your refill."
            elif a.kind == "out_of_stock":
                key = f"stock:{a.medication_id}:{week}"
                title = f"{a.medication_name} has run out"
                body = "No usable supply is recorded. Add a new supply or update your count."
            elif a.kind == "expiring_soon":
                key = f"expiring:{a.supply_id}"
                title = f"{a.medication_name} expires soon"
                body = f"Expires on {a.expiry_date:%d %b %Y}. Check the date on the pack."
            else:
                key = f"expired:{a.supply_id}"
                title = f"{a.medication_name} has expired"
                body = f"The recorded supply expired on {a.expiry_date:%d %b %Y}."
            payload.append(
                {
                    "id": uuid.uuid4(),
                    "patient_user_id": patient_id,
                    "kind": a.kind,
                    "dedupe_key": key,
                    "title": title,
                    "body": body,
                    "due_at": now,
                    "medication_id": a.medication_id,
                    "supply_id": a.supply_id,
                }
            )
    return _insert_notifications(db, payload)


def _has_email_consent(db: Session, user_id) -> bool:
    latest = db.scalar(
        select(UserConsent.granted)
        .where(UserConsent.user_id == user_id, UserConsent.consent_type == "reminder_email")
        .order_by(UserConsent.recorded_at.desc(), UserConsent.id)
        .limit(1)
    )
    return bool(latest)


def deliver(db: Session, now: datetime) -> int:
    """Mark due notifications as delivered to the in-app feed."""
    result = db.execute(
        update(Notification)
        .where(Notification.delivered_at.is_(None), Notification.due_at <= now)
        .values(delivered_at=now)
        .returning(Notification.id)
    )
    return len(result.all())


def send_emails(db: Session, now: datetime, email: EmailProvider, settings: Settings) -> int:
    """At most one email per patient per tick, and only with their consent. The message
    never names a medicine: email is not a private channel."""
    pending = db.scalars(
        select(Notification).where(
            Notification.delivered_at.is_not(None),
            Notification.email_sent_at.is_(None),
            Notification.due_at > now - EMAIL_RETRY_WINDOW,
        )
    ).all()
    by_user: dict = defaultdict(list)
    for n in pending:
        by_user[n.patient_user_id].append(n)
    sent = 0
    for user_id, items in by_user.items():
        user = db.get(User, user_id)
        if user is None or not user.is_active or user.email_verified_at is None:
            continue
        if not _has_email_consent(db, user_id):
            continue
        count = len(items)
        body = (
            f"You have {count} new reminder{'s' if count != 1 else ''} in MediCare AI.\n\n"
            f"Sign in to see {'them' if count != 1 else 'it'}: "
            f"{settings.frontend_base_url}/medications\n\n"
            "You are receiving this because you turned on reminder emails. "
            "You can turn them off in your account settings."
        )
        try:
            email.send(user.email, "You have a MediCare AI reminder", body)
        except Exception as exc:  # one bad address must not stop the tick
            log.warning("reminder_email_failed", extra={"event": type(exc).__name__})
            continue
        for n in items:
            n.email_sent_at = now
        sent += 1
    return sent


def tick(
    db: Session,
    now: datetime,
    email: EmailProvider,
    settings: Settings,
    push: PushProvider | None = None,
) -> TickStats:
    stats = TickStats()
    stats.doses_created = generate_all_doses(db, now)
    stats.notifications_created = create_dose_notifications(db, now) + create_alert_notifications(
        db, now
    )
    stats.delivered = deliver(db, now)
    db.flush()
    stats.emails_sent = send_emails(db, now, email, settings)
    db.commit()
    # Calls last: they commit as they go (the row must exist before the phone is woken), and
    # a failure here must not undo the notifications and emails above.
    if push is not None and settings.calls_enabled:
        call_worker.expire_calls(db, now, settings)
        db.commit()
        call_stats = call_worker.ring_due_doses(db, now, push, settings)
        stats.calls_rung, stats.calls_failed = call_stats.rung, call_stats.push_failed
    return stats
