"""Ring patients about due doses. Called from `medications.worker.tick`, so it inherits the same
guarantees: each step is safe to repeat, and two overlapping workers can't ring twice because
(patient, dedupe_key) is unique and the row is inserted with ON CONFLICT DO NOTHING.

Rules, in order:
  * only with the patient's `reminder_call` consent, and only to a device that can be woken;
  * only for a dose that is still pending and was due no longer ago than CALL_MAX_AGE_MINUTES;
  * at most CALL_MAX_ATTEMPTS rings per dose, CALL_RETRY_AFTER_SECONDS apart, and only after a
    ring that went unanswered or could not be delivered. A declined or answered call is final.

The worker never marks a dose as taken. Only the patient does, with the button in the app.
"""

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.calls import service as svc
from app.calls.models import ReminderCall
from app.calls.push import PushError, PushProvider, Target
from app.core.config import Settings
from app.medications.models import DoseLog, Medication

log = logging.getLogger("app.calls.worker")

# After one of these a dose is not rung again.
_NO_MORE_RINGS = ("ringing", "answered", "completed", "declined")


@dataclass
class CallStats:
    rung: int = 0
    push_failed: int = 0
    missed: int = 0


def expire_calls(db: Session, now: datetime, settings: Settings) -> int:
    """Ringing past its deadline becomes 'missed'; an answered call that was never closed (app
    killed, no network) is closed after CALL_SESSION_MAX_SECONDS."""
    changed = 0
    for call in db.scalars(
        select(ReminderCall).where(
            ReminderCall.status == "ringing", ReminderCall.ring_expires_at <= now
        )
    ).all():
        call.status, call.end_reason, call.ended_at = "missed", "no_answer", now
        changed += 1
    cutoff = now - timedelta(seconds=settings.call_session_max_seconds)
    for call in db.scalars(
        select(ReminderCall).where(
            ReminderCall.status == "answered", ReminderCall.answered_at <= cutoff
        )
    ).all():
        call.status, call.end_reason, call.ended_at = "completed", "session_timeout", now
        changed += 1
    return changed


def ring_due_doses(db: Session, now: datetime, push: PushProvider, settings: Settings) -> CallStats:
    stats = CallStats()
    if not settings.calls_enabled:
        return stats
    due = db.execute(
        select(DoseLog, Medication)
        .join(Medication, Medication.id == DoseLog.medication_id)
        .where(
            DoseLog.status == "pending",
            DoseLog.scheduled_at <= now,
            DoseLog.scheduled_at > now - timedelta(minutes=settings.call_max_age_minutes),
            Medication.status == "active",
        )
        .order_by(DoseLog.scheduled_at)
    ).all()
    consent: dict[uuid.UUID, bool] = {}
    devices: dict[uuid.UUID, list] = {}
    for dose, _med in due:
        patient = dose.patient_user_id
        if patient not in consent:
            consent[patient] = svc.has_call_consent(db, patient)
            devices[patient] = (
                svc.active_devices(db, patient, now, settings) if consent[patient] else []
            )
        if not consent[patient] or not devices[patient]:
            continue

        prior = db.scalars(
            select(ReminderCall)
            .where(ReminderCall.dose_log_id == dose.id)
            .order_by(ReminderCall.attempt)
        ).all()
        if any(c.status in _NO_MORE_RINGS for c in prior):
            continue
        attempt = len(prior) + 1
        if attempt > settings.call_max_attempts:
            continue
        if (
            prior
            and prior[-1].ended_at
            and prior[-1].ended_at > now - timedelta(seconds=settings.call_retry_after_seconds)
        ):
            continue

        device = devices[patient][0]
        call_id = uuid.uuid4()
        inserted = db.execute(
            pg_insert(ReminderCall)
            .values(
                id=call_id,
                patient_user_id=patient,
                device_id=device.id,
                dose_log_id=dose.id,
                dedupe_key=f"dosecall:{dose.id}:{attempt}",
                attempt=attempt,
                status="ringing",
                ring_expires_at=now + timedelta(seconds=settings.call_ring_seconds),
            )
            .on_conflict_do_nothing(index_elements=["patient_user_id", "dedupe_key"])
            .returning(ReminderCall.id)
        ).first()
        if inserted is None:  # another worker got there first
            continue
        # Commit the row before the push: if the push goes out and we then crashed, the phone
        # would ring for a call the server has no record of.
        db.commit()

        call = db.get(ReminderCall, call_id)
        try:
            push.send_call(
                Target(device.platform, device.push_token, device.voip_token),
                str(call_id),
                settings.call_ring_seconds,
            )
            stats.rung += 1
        except PushError as exc:
            call.status, call.end_reason, call.ended_at = "failed", "push_failed", now
            call.error_detail = exc.reason[:200]
            stats.push_failed += 1
            if exc.permanent:
                device.revoked_at = now
                devices[patient] = [d for d in devices[patient] if d.id != device.id]
            log.warning("reminder_call_push_failed", extra={"event": exc.reason[:60]})
        except Exception as exc:  # one bad send must not stop the tick
            call.status, call.end_reason, call.ended_at = "failed", "push_failed", now
            call.error_detail = type(exc).__name__
            stats.push_failed += 1
            log.warning("reminder_call_push_failed", extra={"event": type(exc).__name__})
        db.commit()
    return stats
