"""Reminder-call domain logic shared by the API, the WebSocket and the worker."""

import base64
import hashlib
import hmac
import uuid
from datetime import datetime, timedelta

from itsdangerous import BadData, URLSafeTimedSerializer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.calls.models import CALL_FINAL, Device, ReminderCall
from app.core.config import Settings
from app.core.errors import AppError
from app.medications.models import DoseLog, Medication
from app.patients.models import UserConsent

CALL_CONSENT = "reminder_call"
_TICKET_SALT = "call-signalling-v1"


def not_found() -> AppError:
    return AppError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.")


# ------------------------------------------------------------------------------- consent
def has_call_consent(db: Session, user_id: uuid.UUID) -> bool:
    latest = db.scalar(
        select(UserConsent.granted)
        .where(UserConsent.user_id == user_id, UserConsent.consent_type == CALL_CONSENT)
        .order_by(UserConsent.recorded_at.desc(), UserConsent.id)
        .limit(1)
    )
    return bool(latest)


# ------------------------------------------------------------------------------- devices
def active_devices(
    db: Session, user_id: uuid.UUID, now: datetime, settings: Settings
) -> list[Device]:
    """Devices that can be rung, most recently seen first. An iOS device with no VoIP token
    can't wake a closed app, so it is left out."""
    rows = db.scalars(
        select(Device)
        .where(
            Device.user_id == user_id,
            Device.revoked_at.is_(None),
            Device.last_seen_at > now - timedelta(days=settings.device_stale_days),
        )
        .order_by(Device.last_seen_at.desc())
    ).all()
    return [d for d in rows if d.platform == "android" or d.voip_token]


# ------------------------------------------------------------------------------- ICE / WebRTC
def ice_servers(settings: Settings, user_id: uuid.UUID, now: datetime) -> list[dict]:
    """STUN plus, when configured, TURN with short-lived credentials (coturn `use-auth-secret`:
    username = "<expiry>:<user>", credential = base64(HMAC-SHA1(secret, username)))."""
    servers: list[dict] = []
    if settings.ice_stun:
        servers.append({"urls": settings.ice_stun})
    if settings.ice_turn and settings.turn_secret:
        expiry = int((now + timedelta(seconds=settings.turn_credential_ttl_seconds)).timestamp())
        username = f"{expiry}:{user_id}"
        # coturn's REST API scheme is defined as HMAC-SHA1.
        digest = hmac.new(
            settings.turn_secret.encode(), username.encode(), hashlib.sha1  # noqa: S324
        ).digest()
        servers.append(
            {
                "urls": settings.ice_turn,
                "username": username,
                "credential": base64.b64encode(digest).decode(),
            }
        )
    return servers


def _serializer(settings: Settings) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.secret_key, salt=_TICKET_SALT)


def make_ticket(settings: Settings, call_id: uuid.UUID, user_id: uuid.UUID) -> str:
    """A short-lived token the app presents when it opens the signalling WebSocket. It is bound
    to one call and one user, and the call must still be 'answered' for it to be accepted."""
    return _serializer(settings).dumps({"c": str(call_id), "u": str(user_id)})


def read_ticket(settings: Settings, ticket: str) -> tuple[uuid.UUID, uuid.UUID]:
    try:
        data = _serializer(settings).loads(ticket, max_age=settings.call_ticket_ttl_seconds)
        return uuid.UUID(data["c"]), uuid.UUID(data["u"])
    except (BadData, KeyError, ValueError) as exc:
        raise AppError(
            401, "UNAUTHENTICATED", "The call ticket is invalid or has expired."
        ) from exc


# ------------------------------------------------------------------------------- content
def spoken_text(medication_name: str, dose_text: str | None) -> str:
    """What the server (or, as a fallback, the phone) says once the patient has answered. It is
    only produced after the patient answers inside their signed-in app, so it may name the
    medicine; the push that made the phone ring never does."""
    what = f"{medication_name}, {dose_text}" if dose_text else medication_name
    return (
        "Hello, this is your MediCare AI reminder. "
        f"It is time to take {what}. "
        "When you have taken it, tap I took it on the screen. "
        "Or tap Not now, and it will stay on your list."
    )


def dose_summary(db: Session, call: ReminderCall) -> dict:
    row = db.execute(
        select(DoseLog, Medication)
        .join(Medication, Medication.id == DoseLog.medication_id)
        .where(DoseLog.id == call.dose_log_id)
    ).first()
    if row is None:
        raise not_found()
    dose, med = row
    return {
        "dose_id": dose.id,
        "medication_name": med.display_name,
        "dose_text": med.dose_text,
        "scheduled_at": dose.scheduled_at,
        "status": dose.status,
        "spoken_text": spoken_text(med.display_name, med.dose_text),
    }


# ------------------------------------------------------------------------------- state machine
def owned_call(db: Session, call_id: uuid.UUID, user_id: uuid.UUID, lock: bool = False):
    stmt = select(ReminderCall).where(
        ReminderCall.id == call_id, ReminderCall.patient_user_id == user_id
    )
    if lock:
        stmt = stmt.with_for_update()
    call = db.scalar(stmt)
    if call is None:
        raise not_found()
    return call


def _finish(call: ReminderCall, status: str, reason: str | None, now: datetime) -> None:
    call.status = status
    call.end_reason = reason
    call.ended_at = now


def accept(db: Session, call: ReminderCall, now: datetime) -> None:
    """ringing -> answered. Answering twice, or after the ring ran out, is refused: this is what
    makes the signalling ticket single-use in practice."""
    if call.status != "ringing":
        raise AppError(409, "CALL_NOT_RINGING", "This call is no longer ringing.")
    if call.ring_expires_at <= now:
        _finish(call, "missed", "no_answer", now)
        raise AppError(409, "CALL_NOT_RINGING", "This call is no longer ringing.")
    dose = db.get(DoseLog, call.dose_log_id)
    if dose is None or dose.status != "pending":
        _finish(call, "completed", "dose_already_logged", now)
        raise AppError(409, "DOSE_ALREADY_LOGGED", "This dose has already been dealt with.")
    call.status = "answered"
    call.answered_at = now


def decline(call: ReminderCall, now: datetime) -> None:
    if call.status in CALL_FINAL:
        return
    _finish(call, "declined", "declined_by_patient", now)


def end(call: ReminderCall, now: datetime) -> None:
    if call.status in CALL_FINAL:
        return
    if call.status == "ringing":
        _finish(call, "missed", "ended_before_answer", now)
    else:
        _finish(call, "completed", "ended_by_patient", now)


def mark_media_connected(call: ReminderCall, now: datetime) -> None:
    if call.media_connected_at is None:
        call.media_connected_at = now


# ------------------------------------------------------------------------------- dev helper
TEST_MEDICATION_NAME = "Test reminder (safe to ignore)"


def make_test_call(
    db: Session, user_id: uuid.UUID, now: datetime, settings: Settings, delay_seconds: int = 0
) -> tuple[ReminderCall, Device | None]:
    """DEVELOPMENT ONLY (the router refuses elsewhere). Makes one ringing call for a throw-away
    pending dose so the phone app and WebRTC path can be tried without waiting for a real
    schedule. The medication is created 'stopped' so it never shows in the patient's list and
    the worker never rings it by itself. Like every call, it does not change the dose: the
    patient still has to tap the button."""
    med = db.scalar(
        select(Medication).where(
            Medication.patient_user_id == user_id,
            Medication.display_name == TEST_MEDICATION_NAME,
        )
    )
    if med is None:
        med = Medication(
            patient_user_id=user_id,
            display_name=TEST_MEDICATION_NAME,
            dose_text="1 tablet",
            basis="self_reported",
            status="stopped",
        )
        db.add(med)
        db.flush()
    dose = DoseLog(
        patient_user_id=user_id, medication_id=med.id, scheduled_at=now, status="pending"
    )
    db.add(dose)
    db.flush()
    device = db.scalar(
        select(Device)
        .where(Device.user_id == user_id, Device.revoked_at.is_(None))
        .order_by(Device.last_seen_at.desc())
        .limit(1)
    )
    call = ReminderCall(
        patient_user_id=user_id,
        device_id=device.id if device else None,
        dose_log_id=dose.id,
        dedupe_key=f"devtest:{uuid.uuid4()}",
        attempt=1,
        status="ringing",
        ring_expires_at=now + timedelta(seconds=delay_seconds + settings.call_ring_seconds),
    )
    db.add(call)
    db.flush()
    return call, device
