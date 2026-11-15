"""Authenticity verification adapter.

No authoritative verification source is integrated, so the default adapter always answers
``unable_to_verify``. A real adapter may return ``verified`` only by naming the authoritative
source it queried; the router downgrades a ``verified`` without a source. A barcode scan on its
own is never evidence of authenticity (docs/PRD.md FR-05).
"""

from dataclasses import dataclass
from typing import Protocol

STATUSES = ("verified", "mismatch", "suspicious_for_review", "unable_to_verify")

SCAN_NOTE = (
    "Scanning or typing a barcode, lot number or QR code does not prove a medicine is genuine. "
    "If a pack looks wrong, or you are unsure, take it to a pharmacist and report it to the "
    "regulator."
)


@dataclass(frozen=True)
class AuthenticityResult:
    status: str
    detail: str
    source: str | None = None  # the authoritative source consulted; required for "verified"


class AuthenticityVerifier(Protocol):
    def verify(
        self, *, barcode: str | None, lot_number: str | None, medicine_name: str | None
    ) -> AuthenticityResult: ...


class UnsupportedVerifier:
    """Default: no authoritative source is connected."""

    def verify(
        self, *, barcode: str | None, lot_number: str | None, medicine_name: str | None
    ) -> AuthenticityResult:
        return AuthenticityResult(
            "unable_to_verify",
            "No authoritative verification source is connected to this app, so authenticity "
            "cannot be checked here.",
        )


def checked(result: AuthenticityResult) -> AuthenticityResult:
    """Enforce the invariants on whatever an adapter returned."""
    if result.status not in STATUSES:
        return AuthenticityResult(
            "unable_to_verify", "The verification service gave no usable answer."
        )
    if result.status == "verified" and not result.source:
        return AuthenticityResult(
            "unable_to_verify", "The verification service did not name an authoritative source."
        )
    return result
