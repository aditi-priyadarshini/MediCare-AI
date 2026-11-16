"""Share grants: token handling, recipient code check, view sessions and the summary builder.

Every function that reads patient data takes the owner's id from the grant row (never from a
request), and the grant is re-checked on each access so revocation and expiry are immediate.
"""

import secrets
from datetime import UTC, date, datetime, timedelta

from fastapi import Request
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.ratelimit import client_ip
from app.core.security import BadSignature, constant_time_equals, hash_token, keyed_hash, signer
from app.medications.models import Medication
from app.patients.models import PatientAllergy, PatientCondition, PatientProfile
from app.records.models import HealthRecord, LabResult
from app.sharing.models import ShareAccessChallenge, ShareAccessLog, ShareGrant
from app.sharing.schemas import (
    SharedSummary,
    ShareOut,
    SummaryAllergy,
    SummaryCondition,
    SummaryLab,
    SummaryMedication,
    SummaryProfile,
    SummaryRecord,
)

PURPOSE = "share-access"
VIEW_SALT = "share-view"
MAX_LABS = 500
MAX_RECORDS = 200
MAX_ACTIVE_GRANTS = 20


def now() -> datetime:
    return datetime.now(UTC)


# ------------------------------------------------------------------------- tokens
def new_token() -> str:
    return secrets.token_urlsafe(32)


def grant_by_token(db: Session, token: str) -> ShareGrant | None:
    return db.scalar(select(ShareGrant).where(ShareGrant.token_hash == hash_token(token)))


def grant_status(grant: ShareGrant, at: datetime | None = None) -> str:
    at = at or now()
    if grant.revoked_at is not None:
        return "revoked"
    if grant.expires_at <= at:
        return "expired"
    return "active"


def share_out(grant: ShareGrant) -> ShareOut:
    return ShareOut(
        id=grant.id,
        recipient_name=grant.recipient_name,
        recipient_email=grant.recipient_email,
        categories=list(grant.categories),
        date_from=grant.date_from,
        date_to=grant.date_to,
        expires_at=grant.expires_at,
        revoked_at=grant.revoked_at,
        created_at=grant.created_at,
        last_accessed_at=grant.last_accessed_at,
        access_count=grant.access_count,
        notified_at=grant.notified_at,
        status=grant_status(grant),
    )


def log_access(db: Session, grant: ShareGrant, event: str, request: Request | None) -> None:
    db.add(
        ShareAccessLog(grant_id=grant.id, event=event, ip=client_ip(request) if request else None)
    )


# ------------------------------------------------------------- recipient code check
def _code_hash(settings: Settings, challenge_id, code: str) -> str:
    return keyed_hash(settings.secret_key, PURPOSE, str(challenge_id), code)


def in_resend_cooldown(db: Session, settings: Settings, grant: ShareGrant) -> bool:
    if settings.otp_resend_cooldown_seconds <= 0:
        return False
    last = db.scalar(
        select(ShareAccessChallenge)
        .where(ShareAccessChallenge.grant_id == grant.id)
        .order_by(ShareAccessChallenge.created_at.desc())
        .limit(1)
    )
    return last is not None and (
        (now() - last.created_at).total_seconds() < settings.otp_resend_cooldown_seconds
    )


def issue_code(db: Session, settings: Settings, grant: ShareGrant) -> str:
    """Retire older codes and store a keyed hash of a new 6-digit one. Caller commits."""
    db.execute(
        update(ShareAccessChallenge)
        .where(
            ShareAccessChallenge.grant_id == grant.id,
            ShareAccessChallenge.consumed_at.is_(None),
        )
        .values(consumed_at=now())
    )
    code = f"{secrets.randbelow(1_000_000):06d}"
    challenge = ShareAccessChallenge(
        grant_id=grant.id,
        code_hash="",
        expires_at=now() + timedelta(minutes=settings.otp_ttl_minutes),
    )
    db.add(challenge)
    db.flush()
    challenge.code_hash = _code_hash(settings, challenge.id, code)
    return code


def check_code(db: Session, settings: Settings, grant: ShareGrant, code: str) -> bool:
    """Check the latest active code. The attempt is counted whether or not it matches."""
    challenge = db.scalar(
        select(ShareAccessChallenge)
        .where(ShareAccessChallenge.grant_id == grant.id)
        .order_by(ShareAccessChallenge.created_at.desc())
        .limit(1)
    )
    if (
        challenge is None
        or challenge.consumed_at is not None
        or challenge.expires_at <= now()
        or challenge.attempt_count >= settings.otp_max_attempts
    ):
        return False
    challenge.attempt_count += 1
    ok = constant_time_equals(_code_hash(settings, challenge.id, code), challenge.code_hash)
    if ok:
        challenge.consumed_at = now()
    return ok


# ------------------------------------------------------------------ view sessions
def make_view_session(settings: Settings, grant: ShareGrant) -> str:
    return signer(settings.secret_key, VIEW_SALT).dumps({"g": str(grant.id)})


def grant_from_view_session(
    db: Session, settings: Settings, token: str | None
) -> ShareGrant | None:
    """The session only names the grant; the grant itself is loaded and re-checked each time."""
    if not token:
        return None
    try:
        data = signer(settings.secret_key, VIEW_SALT).loads(
            token, max_age=settings.share_view_ttl_seconds
        )
        grant_id = data["g"]
    except (BadSignature, KeyError, TypeError):
        return None
    return db.scalar(select(ShareGrant).where(ShareGrant.id == grant_id))


# ------------------------------------------------------------------- the summary
BASE_LIMITATIONS = [
    "This is a selection chosen by the patient. It is not a complete medical record.",
    "Entries are as recorded by the patient in MediCare AI. Anything marked patient_reported "
    "has not been checked by a clinician.",
    "Attached files and free-text notes are not shared.",
]


def _f(value) -> float | None:
    return None if value is None else float(value)


def _in_range(column, date_from: date | None, date_to: date | None) -> list:
    filters = []
    if date_from:
        filters.append(column >= date_from)
    if date_to:
        filters.append(column <= date_to)
    return filters


def build_summary(
    db: Session,
    patient_user_id,
    categories: list[str],
    date_from: date | None,
    date_to: date | None,
) -> SharedSummary:
    """Read only the chosen categories, only for this patient, only active (not removed) rows."""
    out = SharedSummary(
        generated_at=now(),
        categories=list(categories),  # type: ignore[arg-type]
        date_from=date_from,
        date_to=date_to,
        limitations=list(BASE_LIMITATIONS),
    )

    if "profile" in categories:
        p = db.scalar(select(PatientProfile).where(PatientProfile.user_id == patient_user_id))
        if p is not None:
            out.profile = SummaryProfile(
                display_name=p.display_name,
                date_of_birth=p.date_of_birth,
                blood_group=p.blood_group,
                blood_group_verification_status=p.blood_group_verification_status,
            )

    if "conditions" in categories:
        rows = db.scalars(
            select(PatientCondition)
            .where(
                PatientCondition.patient_user_id == patient_user_id,
                PatientCondition.status == "active",
            )
            .order_by(PatientCondition.display_name)
        ).all()
        out.conditions = [
            SummaryCondition(
                display_name=r.display_name,
                status=r.status,
                onset_date=r.onset_date,
                verification_status=r.verification_status,
            )
            for r in rows
        ]

    if "allergies" in categories:
        rows = db.scalars(
            select(PatientAllergy)
            .where(
                PatientAllergy.patient_user_id == patient_user_id,
                PatientAllergy.status == "active",
            )
            .order_by(PatientAllergy.substance)
        ).all()
        out.allergies = [
            SummaryAllergy(
                substance=r.substance,
                reaction=r.reaction,
                severity=r.severity,
                verification_status=r.verification_status,
            )
            for r in rows
        ]

    if "medications" in categories:
        rows = db.scalars(
            select(Medication)
            .where(
                Medication.patient_user_id == patient_user_id,
                Medication.status.in_(("active", "paused")),
            )
            .order_by(Medication.display_name)
        ).all()
        out.medications = [
            SummaryMedication(
                display_name=r.display_name,
                strength_text=r.strength_text,
                form=r.form,
                dose_text=r.dose_text,
                instructions=r.instructions,
                as_needed=r.as_needed,
                basis=r.basis,
                status=r.status,
                start_date=r.start_date,
                end_date=r.end_date,
                verification_status=r.verification_status,
            )
            for r in rows
        ]
        out.limitations.append(
            "A medicine being listed does not prove it is currently being taken."
        )

    if "labs" in categories:
        rows = db.scalars(
            select(LabResult)
            .where(
                LabResult.patient_user_id == patient_user_id,
                LabResult.status == "active",
                *_in_range(LabResult.observed_on, date_from, date_to),
            )
            .order_by(LabResult.observed_on.desc(), LabResult.test_name)
            .limit(MAX_LABS)
        ).all()
        out.labs = [
            SummaryLab(
                test_name=r.test_name,
                value_numeric=_f(r.value_numeric),
                value_text=r.value_text,
                unit=r.unit,
                ref_low=_f(r.ref_low),
                ref_high=_f(r.ref_high),
                flag=r.flag,
                observed_on=r.observed_on,
                verification_status=r.verification_status,
            )
            for r in rows
        ]
        out.limitations.append(
            "A lab flag only compares a value with the range printed on its own report. "
            "It is not a diagnosis."
        )

    if "records" in categories:
        rows = db.scalars(
            select(HealthRecord)
            .where(
                HealthRecord.patient_user_id == patient_user_id,
                HealthRecord.status == "active",
                *_in_range(HealthRecord.record_date, date_from, date_to),
            )
            .order_by(HealthRecord.record_date.desc().nulls_last(), HealthRecord.title)
            .limit(MAX_RECORDS)
        ).all()
        out.records = [
            SummaryRecord(
                title=r.title,
                record_type=r.record_type,
                record_date=r.record_date,
                provider_name=r.provider_name,
                verification_status=r.verification_status,
                has_file=r.has_file,
            )
            for r in rows
        ]
        out.limitations.append(
            "Records are listed by title only; the documents themselves are not shared."
        )

    if ("labs" in categories or "records" in categories) and (date_from or date_to):
        out.limitations.append(
            "Lab results and records are limited to the chosen dates; undated records are left out."
        )
    return out
