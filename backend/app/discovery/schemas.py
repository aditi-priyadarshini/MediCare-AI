import re
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.pagination import Page

Availability = Literal["in_stock", "low_stock", "out_of_stock"]
BookingMode = Literal["request_only", "provider"]
SourceKind = Literal["directory", "inventory", "credential"]
CredentialStatus = Literal["unverified", "source_listed", "verified"]
Window = Literal["any", "morning", "afternoon", "evening"]
AppointmentStatus = Literal["request_only", "sent", "confirmed", "declined", "cancelled"]

PHARMACY_NOTICE = (
    "Hours, stock and prices come from the sources shown and may be out of date. "
    "Call the pharmacy to confirm before you travel."
)
DOCTOR_NOTICE = (
    "Doctors are listed by distance or name, never ranked by quality, and this is not a "
    "recommendation. Each credential says how, and whether, it was checked."
)
NO_FEED_MESSAGE = (
    "No stock information is available for this pharmacy. Call to confirm availability."
)

_PHONE = re.compile(r"^[0-9+()\-\s]{5,24}$")


def _clean(v: str | None) -> str | None:
    if v is None:
        return None
    v = " ".join(v.split())
    return v or None


def _terms(values: list[str], limit: int, size: int) -> list[str]:
    out: list[str] = []
    for raw in values:
        v = (_clean(raw) or "").lower()
        if not v:
            continue
        if len(v) > size:
            raise ValueError(f"Each entry must be at most {size} characters.")
        if v not in out:
            out.append(v)
    if len(out) > limit:
        raise ValueError(f"At most {limit} entries.")
    return out


# ------------------------------------------------------------------------------ outputs
class SourceBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    name: str
    publisher: str | None
    url: str | None
    licence: str | None
    jurisdiction: str
    retrieved_on: date


class Freshness(BaseModel):
    state: Literal["fresh", "stale"]
    observed_at: datetime
    age_days: int
    label: str


class StockOut(BaseModel):
    """What a named source reported. Never a live claim: `call_to_confirm` is true unless the
    report is still within that source's own freshness window."""

    state: Literal["no_feed", "reported"]
    reported: Availability | None = None
    price_amount: Decimal | None = None
    currency: str | None = None
    pack_size_text: str | None = None
    source_name: str | None = None
    source_timestamp: datetime | None = None
    freshness: Freshness | None = None
    call_to_confirm: bool = True
    message: str


class PharmacyOut(BaseModel):
    id: uuid.UUID
    name: str
    address_line: str
    city: str
    state: str | None
    postal_code: str | None
    latitude: float | None
    longitude: float | None
    phone: str | None
    hours_text: str | None
    verification_status: Literal["unverified", "source_listed"]
    source: SourceBrief
    freshness: Freshness
    distance_km: float | None = None
    stock: StockOut | None = None


class PharmacyPage(Page[PharmacyOut]):
    notice: str = PHARMACY_NOTICE


class MedicineRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    form: str | None
    strength_text: str | None


class InventoryItemOut(BaseModel):
    medicine: MedicineRef
    stock: StockOut


class InventoryOut(BaseModel):
    pharmacy_id: uuid.UUID
    feed_available: bool
    items: list[InventoryItemOut]
    message: str


class CredentialOut(BaseModel):
    qualification: str
    registration_masked: str | None
    issuing_authority: str | None
    status: CredentialStatus
    verified_at: datetime | None
    verification_source: SourceBrief | None
    label: str


class DoctorOut(BaseModel):
    id: uuid.UUID
    display_name: str
    clinic_name: str | None
    specialties: list[str]
    languages: list[str]
    address_line: str | None
    city: str
    state: str | None
    postal_code: str | None
    latitude: float | None
    longitude: float | None
    phone: str | None
    booking_mode: BookingMode
    appointment_note: str
    credential_status: CredentialStatus
    credential_label: str
    credentials: list[CredentialOut]
    source: SourceBrief
    freshness: Freshness
    distance_km: float | None = None


class DoctorPage(Page[DoctorOut]):
    notice: str = DOCTOR_NOTICE


class DoctorBrief(BaseModel):
    id: uuid.UUID
    display_name: str
    clinic_name: str | None
    phone: str | None
    city: str


class AppointmentOut(BaseModel):
    id: uuid.UUID
    doctor: DoctorBrief
    preferred_date: date
    preferred_window: Window
    reason: str | None
    mode: BookingMode
    status: AppointmentStatus
    status_text: str
    provider_reference: str | None
    provider_responded_at: datetime | None
    provider_message: str | None
    created_at: datetime


# ------------------------------------------------------------------------ patient input
class AppointmentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    doctor_id: uuid.UUID
    preferred_date: date
    preferred_window: Window = "any"
    reason: str | None = Field(default=None, max_length=500)

    _c = field_validator("reason")(_clean)

    @field_validator("preferred_date")
    @classmethod
    def _in_window(cls, v: date) -> date:
        # One day of slack so a patient ahead of UTC (e.g. IST) can pick their own today.
        today = datetime.now(UTC).date()
        if v < today - timedelta(days=1) or v > today + timedelta(days=90):
            raise ValueError("Choose a date within the next 90 days.")
        return v


# --------------------------------------------------------------------------- admin input
class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ProviderSourceIn(_Strict):
    name: str = Field(min_length=1, max_length=200)
    publisher: str | None = Field(default=None, max_length=200)
    url: str | None = Field(default=None, max_length=500, pattern=r"^https?://")
    licence: str | None = Field(default=None, max_length=200)
    jurisdiction: str = Field(min_length=2, max_length=16)
    kind: SourceKind
    retrieved_on: date
    stale_after_hours: int = Field(ge=1, le=24 * 3650)

    _c = field_validator("name", "publisher", "licence")(_clean)


class ProviderSourceOut(SourceBrief):
    id: uuid.UUID
    kind: SourceKind
    stale_after_hours: int


class _Place(_Strict):
    address_line: str | None = Field(default=None, max_length=300)
    city: str = Field(min_length=1, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=12)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    phone: str | None = Field(default=None, max_length=24)
    source_id: uuid.UUID
    source_observed_at: datetime

    @field_validator("address_line", "city", "state", "postal_code")
    @classmethod
    def _tidy(cls, v: str | None) -> str | None:
        return _clean(v)

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str | None) -> str | None:
        v = _clean(v)
        if v is not None and not _PHONE.match(v):
            raise ValueError("Enter a phone number using digits, +, spaces, brackets or dashes.")
        return v

    @model_validator(mode="after")
    def _coordinates(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Give both latitude and longitude, or neither.")
        if self.source_observed_at.tzinfo is None:
            raise ValueError("source_observed_at needs a time zone.")
        if self.source_observed_at > datetime.now(UTC) + timedelta(hours=1):
            raise ValueError("source_observed_at cannot be in the future.")
        return self


class PharmacyIn(_Place):
    name: str = Field(min_length=1, max_length=200)
    address_line: str = Field(min_length=1, max_length=300)  # type: ignore[assignment]
    hours_text: str | None = Field(default=None, max_length=300)
    verification_status: Literal["unverified", "source_listed"] = "source_listed"

    _c = field_validator("name", "hours_text")(_clean)


class DoctorIn(_Place):
    display_name: str = Field(min_length=1, max_length=200)
    clinic_name: str | None = Field(default=None, max_length=200)
    specialties: list[str] = Field(default_factory=list, max_length=8)
    languages: list[str] = Field(default_factory=list, max_length=8)
    booking_mode: BookingMode = "request_only"

    _c = field_validator("display_name", "clinic_name")(_clean)

    @field_validator("specialties", "languages")
    @classmethod
    def _lists(cls, v: list[str]) -> list[str]:
        return _terms(v, 8, 40)


class AdminPlaceOut(BaseModel):
    id: uuid.UUID


class CredentialIn(_Strict):
    qualification: str = Field(min_length=1, max_length=200)
    registration_number: str | None = Field(default=None, max_length=64)
    issuing_authority: str | None = Field(default=None, max_length=200)
    status: CredentialStatus = "unverified"
    verification_source_id: uuid.UUID | None = None
    verified_at: datetime | None = None

    _c = field_validator("qualification", "registration_number", "issuing_authority")(
        lambda cls, v: _clean(v)
    )

    @model_validator(mode="after")
    def _provenance(self):
        if self.status == "verified":
            if self.verification_source_id is None or self.verified_at is None:
                raise ValueError(
                    "A verified credential needs verification_source_id and verified_at."
                )
            if self.verified_at.tzinfo is None:
                raise ValueError("verified_at needs a time zone.")
        elif self.verification_source_id is not None or self.verified_at is not None:
            raise ValueError("Only a verified credential carries a verification source and time.")
        return self


class InventoryRowIn(_Strict):
    medicine_id: uuid.UUID
    availability: Availability
    price_amount: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")
    pack_size_text: str | None = Field(default=None, max_length=64)
    source_timestamp: datetime

    @model_validator(mode="after")
    def _shape(self):
        if (self.price_amount is None) != (self.currency is None):
            raise ValueError("Give both price_amount and currency, or neither.")
        if self.source_timestamp.tzinfo is None:
            raise ValueError("source_timestamp needs a time zone.")
        if self.source_timestamp > datetime.now(UTC) + timedelta(minutes=5):
            raise ValueError("source_timestamp cannot be in the future.")
        return self


class InventoryFeedIn(_Strict):
    source_id: uuid.UUID
    items: list[InventoryRowIn] = Field(min_length=1, max_length=200)


class InventoryFeedOut(BaseModel):
    accepted: int


class ProviderResponseIn(_Strict):
    provider_reference: str = Field(min_length=1, max_length=120)
    outcome: Literal["confirmed", "declined"]
    message: str | None = Field(default=None, max_length=300)

    _c = field_validator("message")(_clean)
