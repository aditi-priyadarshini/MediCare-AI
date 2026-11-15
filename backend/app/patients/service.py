from typing import get_args

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.patients.models import PatientProfile, UserConsent
from app.patients.schemas import (
    CURRENT_POLICY_VERSION,
    REQUIRED_CONSENTS,
    ConsentOut,
    ConsentType,
)

ALL_CONSENTS: tuple[str, ...] = get_args(ConsentType)


def current_consents(db: Session, user_id) -> list[ConsentOut]:
    rows = db.scalars(
        select(UserConsent)
        .where(UserConsent.user_id == user_id)
        .order_by(UserConsent.recorded_at.desc(), UserConsent.id)
    ).all()
    latest: dict[str, UserConsent] = {}
    for row in rows:
        latest.setdefault(row.consent_type, row)
    out = []
    for ctype in ALL_CONSENTS:
        row = latest.get(ctype)
        out.append(
            ConsentOut(
                consent_type=ctype,
                granted=bool(row and row.granted),
                policy_version=row.policy_version if row else None,
                recorded_at=row.recorded_at if row else None,
                required=ctype in REQUIRED_CONSENTS,
            )
        )
    return out


def record_consent(db: Session, user_id, consent_type: str, granted: bool) -> None:
    db.add(
        UserConsent(
            user_id=user_id,
            consent_type=consent_type,
            granted=granted,
            policy_version=CURRENT_POLICY_VERSION,
        )
    )


def onboarding_completed(db: Session, user_id) -> bool:
    state = {c.consent_type: c.granted for c in current_consents(db, user_id)}
    return all(state.get(c) for c in REQUIRED_CONSENTS)


def completeness(profile: PatientProfile, has_emergency_contact: bool) -> int:
    """Share of optional profile facts filled in (not a health score).

    Conditions and allergies are deliberately excluded: "none" is a valid answer and an
    empty list must never make a profile look deficient.
    """
    checks = [
        profile.date_of_birth is not None,
        profile.height_cm is not None and profile.weight_kg is not None,
        profile.blood_group is not None,
        has_emergency_contact,
    ]
    return round(100 * sum(checks) / len(checks))
