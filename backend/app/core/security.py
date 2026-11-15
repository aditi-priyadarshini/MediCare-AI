import hashlib
import hmac
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from itsdangerous import BadSignature, URLSafeTimedSerializer

_hasher = PasswordHasher()  # Argon2id with library defaults
DUMMY_HASH = _hasher.hash("not-a-real-password")  # equalises timing for unknown accounts


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    if not password_hash:
        _verify_dummy(password)
        return False
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def _verify_dummy(password: str) -> None:
    try:
        _hasher.verify(DUMMY_HASH, password)
    except (VerificationError, InvalidHashError):
        pass


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Session tokens are high-entropy random values, so a plain SHA-256 is sufficient."""
    return hashlib.sha256(token.encode()).hexdigest()


def csrf_token_for(secret: str, session_token: str) -> str:
    """CSRF token bound to the session; stateless to verify."""
    return hmac.new(secret.encode(), f"csrf:{session_token}".encode(), hashlib.sha256).hexdigest()


def keyed_hash(secret: str, *parts: str) -> str:
    """HMAC for short OTP codes (a bare hash of a 6-digit code is trivially brute-forced)."""
    return hmac.new(secret.encode(), ":".join(parts).encode(), hashlib.sha256).hexdigest()


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


def email_digest(email: str) -> str:
    return hashlib.sha256(email.strip().lower().encode()).hexdigest()


def signer(secret: str, salt: str) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(secret, salt=salt)


__all__ = [
    "BadSignature",
    "constant_time_equals",
    "csrf_token_for",
    "email_digest",
    "hash_password",
    "hash_token",
    "keyed_hash",
    "new_session_token",
    "signer",
    "verify_password",
]
