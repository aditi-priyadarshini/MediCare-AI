import logging
import re
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import Response
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import (
    constant_time_equals,
    csrf_token_for,
    email_digest,
    hash_token,
    keyed_hash,
    new_session_token,
)
from app.identity.models import OtpChallenge, SessionRecord, User
from app.identity.providers import EmailProvider
from app.patients.models import PatientProfile

log = logging.getLogger("app.identity")

PURPOSE_VERIFY = "email_verify"
PURPOSE_RESET = "password_reset"


def now() -> datetime:
    return datetime.now(UTC)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def validate_password(password: str, email: str | None = None) -> str | None:
    """Return an error message, or None when the password is acceptable."""
    if len(password) < 10:
        return "Password must be at least 10 characters."
    if len(password) > 128:
        return "Password must be at most 128 characters."
    if password.isdigit() or len(set(password)) < 4:
        return "Password is too simple."
    if email and password.lower() == email.lower():
        return "Password must not match your email address."
    return None


# ------------------------------------------------------------------------- users
def create_user(
    db: Session,
    email: str,
    password_hash: str | None,
    display_name: str,
    email_verified: bool = False,
    role: str = "patient",
) -> User:
    user = User(
        email=normalize_email(email),
        password_hash=password_hash,
        role=role,
        email_verified_at=now() if email_verified else None,
    )
    db.add(user)
    db.flush()
    db.add(PatientProfile(user_id=user.id, display_name=display_name.strip()[:120]))
    return user


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == normalize_email(email)))


# ---------------------------------------------------------------------- sessions
def create_session(db: Session, settings: Settings, user: User) -> str:
    token = new_session_token()
    db.add(
        SessionRecord(
            user_id=user.id,
            session_token_hash=hash_token(token),
            expires_at=now() + timedelta(hours=settings.session_ttl_hours),
        )
    )
    return token


def revoke_session_by_token(db: Session, token: str) -> None:
    db.execute(
        update(SessionRecord)
        .where(SessionRecord.session_token_hash == hash_token(token))
        .where(SessionRecord.revoked_at.is_(None))
        .values(revoked_at=now())
    )


def revoke_all_sessions(db: Session, user_id) -> None:
    db.execute(
        update(SessionRecord)
        .where(SessionRecord.user_id == user_id)
        .where(SessionRecord.revoked_at.is_(None))
        .values(revoked_at=now())
    )


def set_session_cookie(response: Response, settings: Settings, token: str) -> None:
    response.set_cookie(
        settings.session_cookie_name,
        token,
        max_age=settings.session_ttl_hours * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path="/",
    )


def clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        settings.session_cookie_name,
        path="/",
        secure=settings.cookie_secure,
        httponly=True,
        samesite=settings.cookie_samesite,
    )


def csrf_for(settings: Settings, token: str) -> str:
    return csrf_token_for(settings.secret_key, token)


# --------------------------------------------------------------------------- OTP
def _code_hash(settings: Settings, purpose: str, challenge_id, code: str) -> str:
    return keyed_hash(settings.secret_key, purpose, str(challenge_id), code)


def _latest_challenge(db: Session, user_id, purpose: str) -> OtpChallenge | None:
    return db.scalar(
        select(OtpChallenge)
        .where(OtpChallenge.user_id == user_id, OtpChallenge.purpose == purpose)
        .order_by(OtpChallenge.created_at.desc())
        .limit(1)
    )


def in_resend_cooldown(db: Session, settings: Settings, user_id, purpose: str) -> bool:
    last = _latest_challenge(db, user_id, purpose)
    if last is None:
        return False
    return (now() - last.created_at).total_seconds() < settings.otp_resend_cooldown_seconds


_EMAIL_COPY = {
    PURPOSE_VERIFY: (
        "Verify your MediCare AI email",
        "Your MediCare AI verification code is {code}.\n\n"
        "It expires in {minutes} minutes. If you did not create an account, ignore this email.",
    ),
    PURPOSE_RESET: (
        "Reset your MediCare AI password",
        "Your MediCare AI password reset code is {code}.\n\n"
        "It expires in {minutes} minutes. If you did not request this, ignore this email "
        "and your password will stay unchanged.",
    ),
}


def issue_otp(
    db: Session, settings: Settings, email_provider: EmailProvider, user: User, purpose: str
) -> None:
    """Invalidate older codes, store a hashed 6-digit code, then email it."""
    db.execute(
        update(OtpChallenge)
        .where(
            OtpChallenge.user_id == user.id,
            OtpChallenge.purpose == purpose,
            OtpChallenge.consumed_at.is_(None),
        )
        .values(consumed_at=now())
    )
    code = f"{secrets.randbelow(1_000_000):06d}"
    challenge = OtpChallenge(
        user_id=user.id,
        destination_hash=email_digest(user.email),
        purpose=purpose,
        code_hash="",
        expires_at=now() + timedelta(minutes=settings.otp_ttl_minutes),
    )
    db.add(challenge)
    db.flush()
    challenge.code_hash = _code_hash(settings, purpose, challenge.id, code)
    db.commit()  # persist before sending so an email never exists without its challenge

    subject, template = _EMAIL_COPY[purpose]
    try:
        email_provider.send(
            user.email, subject, template.format(code=code, minutes=settings.otp_ttl_minutes)
        )
    except Exception:  # delivery failure must not reveal anything; the user can resend
        log.error("email_delivery_failed", extra={"event": purpose})


def check_otp(db: Session, settings: Settings, user: User, purpose: str, code: str) -> bool:
    """Verify the latest active code. Failed attempts are persisted before returning."""
    challenge = _latest_challenge(db, user.id, purpose)
    if (
        challenge is None
        or challenge.consumed_at is not None
        or challenge.expires_at <= now()
        or challenge.attempt_count >= settings.otp_max_attempts
    ):
        return False
    challenge.attempt_count += 1
    expected = _code_hash(settings, purpose, challenge.id, code.strip())
    ok = constant_time_equals(expected, challenge.code_hash)
    if ok:
        challenge.consumed_at = now()
    db.commit()
    return ok


_SAFE_ID = re.compile(r"^[A-Za-z0-9_\-]{8,64}$")


def safe_request_id(value: str | None) -> str | None:
    return value if value and _SAFE_ID.match(value) else None
