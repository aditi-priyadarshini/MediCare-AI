import uuid
from datetime import date, datetime, timedelta
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.medications.schedule import load_zone, parse_hhmm

MedicationStatus = Literal["active", "paused", "stopped", "entered_in_error"]
MedicationBasis = Literal["prescribed", "self_reported"]
DoseStatus = Literal["pending", "taken", "skipped"]
SupplyStatus = Literal["active", "discarded", "entered_in_error"]
NotificationKind = Literal["dose_due", "refill_soon", "out_of_stock", "expiring_soon", "expired"]
AlertKind = Literal["refill_soon", "out_of_stock", "expiring_soon", "expired"]


def _clean(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    return v or None


def _squash(v: str) -> str:
    return " ".join(v.split())


def _sane_date(v: date | None) -> date | None:
    if v is not None and not (1900 <= v.year <= 2200):
        raise ValueError("Enter a valid date.")
    return v


def _not_future(v: date | None) -> date | None:
    # One day of slack so a patient ahead of UTC (e.g. IST) can enter today's date.
    if v is not None and (v > date.today() + timedelta(days=1) or v.year < 1900):
        raise ValueError("Enter a valid date that is not in the future.")
    return v


# ---------------------------------------------------------------------------- medicines
class MedicineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    form: str | None
    strength_text: str | None


class MedicineIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120)
    form: str | None = Field(default=None, max_length=32)
    strength_text: str | None = Field(default=None, max_length=64)

    _clean_text = field_validator("form", "strength_text")(_clean)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = _squash(v)
        if not v:
            raise ValueError("Name is required.")
        return v


# ------------------------------------------------------------------------- prescriptions
class PrescriptionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    record_id: uuid.UUID | None = None
    prescriber_name: str | None = Field(default=None, max_length=200)
    prescribed_on: date | None = None
    valid_until: date | None = None
    notes: str | None = Field(default=None, max_length=2000)

    _prescribed = field_validator("prescribed_on")(_not_future)
    _until = field_validator("valid_until")(_sane_date)
    _clean_text = field_validator("prescriber_name", "notes")(_clean)


class PrescriptionPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    record_id: uuid.UUID | None = None
    prescriber_name: str | None = Field(default=None, max_length=200)
    prescribed_on: date | None = None
    valid_until: date | None = None
    notes: str | None = Field(default=None, max_length=2000)
    status: Literal["active", "entered_in_error"] | None = None

    _prescribed = field_validator("prescribed_on")(_not_future)
    _until = field_validator("valid_until")(_sane_date)
    _clean_text = field_validator("prescriber_name", "notes")(_clean)


class PrescriptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    record_id: uuid.UUID | None
    prescriber_name: str | None
    prescribed_on: date | None
    valid_until: date | None
    notes: str | None
    status: Literal["active", "entered_in_error"]
    verification_status: str
    created_at: datetime


# --------------------------------------------------------------------------- medications
class MedicationIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    medicine_id: uuid.UUID | None = None
    # A prescription makes this medication 'prescribed'; without one it is 'self_reported'.
    prescription_id: uuid.UUID | None = None
    display_name: str = Field(min_length=1, max_length=120)
    strength_text: str | None = Field(default=None, max_length=64)
    form: str | None = Field(default=None, max_length=32)
    dose_text: str | None = Field(default=None, max_length=120)
    units_per_dose: float = Field(default=1, gt=0, le=1000)
    instructions: str | None = Field(default=None, max_length=1000)
    reason: str | None = Field(default=None, max_length=500)
    as_needed: bool = False
    start_date: date | None = None
    end_date: date | None = None
    refill_threshold_days: int = Field(default=7, ge=0, le=90)

    _dates = field_validator("start_date", "end_date")(_sane_date)
    _clean_text = field_validator("strength_text", "form", "dose_text", "instructions", "reason")(
        _clean
    )

    @field_validator("display_name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = _squash(v)
        if not v:
            raise ValueError("Medication name is required.")
        return v

    @model_validator(mode="after")
    def _range(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("End date cannot be before the start date.")
        return self


class MedicationPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    medicine_id: uuid.UUID | None = None
    prescription_id: uuid.UUID | None = None
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    strength_text: str | None = Field(default=None, max_length=64)
    form: str | None = Field(default=None, max_length=32)
    dose_text: str | None = Field(default=None, max_length=120)
    units_per_dose: float | None = Field(default=None, gt=0, le=1000)
    instructions: str | None = Field(default=None, max_length=1000)
    reason: str | None = Field(default=None, max_length=500)
    as_needed: bool | None = None
    start_date: date | None = None
    end_date: date | None = None
    refill_threshold_days: int | None = Field(default=None, ge=0, le=90)
    status: MedicationStatus | None = None

    _dates = field_validator("start_date", "end_date")(_sane_date)
    _clean_text = field_validator("strength_text", "form", "dose_text", "instructions", "reason")(
        _clean
    )

    @field_validator("display_name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = _squash(v)
        if not v:
            raise ValueError("Medication name is required.")
        return v


class MedicationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    medicine_id: uuid.UUID | None
    prescription_id: uuid.UUID | None
    display_name: str
    strength_text: str | None
    form: str | None
    dose_text: str | None
    units_per_dose: float
    instructions: str | None
    reason: str | None
    as_needed: bool
    basis: MedicationBasis
    start_date: date | None
    end_date: date | None
    status: MedicationStatus
    refill_threshold_days: int
    verification_status: str
    created_at: datetime


# ----------------------------------------------------------------------------- schedules
def _check_times(v: list[str]) -> list[str]:
    if not v:
        raise ValueError("Add at least one time.")
    if len(v) > 12:
        raise ValueError("A schedule can have up to 12 times a day.")
    parsed = {parse_hhmm(t) for t in v}
    return sorted(f"{t.hour:02d}:{t.minute:02d}" for t in parsed)


def _check_times_opt(v: list[str] | None) -> list[str] | None:
    return None if v is None else _check_times(v)


def _check_zone(v: str | None) -> str | None:
    if v is not None:
        load_zone(v)
    return v


def _check_days(v: list[int] | None) -> list[int] | None:
    if v is None:
        return None
    if not v or any(d < 0 or d > 6 for d in v):
        raise ValueError("Days of the week must be 0 (Monday) to 6 (Sunday).")
    return sorted(set(v))


class ScheduleIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    times: list[str]
    days_of_week: list[int] | None = None
    every_n_days: int = Field(default=1, ge=1, le=365)
    start_date: date
    end_date: date | None = None
    # Defaults to the patient's profile time zone.
    timezone: str | None = None

    _times = field_validator("times")(_check_times)
    _days = field_validator("days_of_week")(_check_days)
    _zone = field_validator("timezone")(_check_zone)
    _dates = field_validator("start_date", "end_date")(_sane_date)

    @model_validator(mode="after")
    def _combo(self):
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("End date cannot be before the start date.")
        if self.every_n_days > 1 and self.days_of_week is not None:
            raise ValueError("Choose either specific weekdays or every N days, not both.")
        return self


class SchedulePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    times: list[str] | None = None
    days_of_week: list[int] | None = None
    every_n_days: int | None = Field(default=None, ge=1, le=365)
    start_date: date | None = None
    end_date: date | None = None
    timezone: str | None = None
    is_active: bool | None = None

    _times = field_validator("times")(_check_times_opt)
    _days = field_validator("days_of_week")(_check_days)
    _zone = field_validator("timezone")(_check_zone)
    _dates = field_validator("start_date", "end_date")(_sane_date)


class ScheduleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    medication_id: uuid.UUID
    timezone: str
    times: list[str]
    days_of_week: list[int] | None
    every_n_days: int
    start_date: date
    end_date: date | None
    is_active: bool


# ------------------------------------------------------------------------------ supplies
class SupplyIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lot_number: str | None = Field(default=None, max_length=64)
    manufacturer: str | None = Field(default=None, max_length=200)
    expiry_date: date | None = None
    received_on: date | None = None
    unit: str | None = Field(default=None, max_length=16)
    quantity_initial: float = Field(gt=0, le=100000)
    quantity_remaining: float | None = Field(default=None, ge=0, le=100000)

    _dates = field_validator("expiry_date")(_sane_date)
    _received = field_validator("received_on")(_not_future)
    _clean_text = field_validator("lot_number", "manufacturer", "unit")(_clean)


class SupplyPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lot_number: str | None = Field(default=None, max_length=64)
    manufacturer: str | None = Field(default=None, max_length=200)
    expiry_date: date | None = None
    received_on: date | None = None
    unit: str | None = Field(default=None, max_length=16)
    quantity_remaining: float | None = Field(default=None, ge=0, le=100000)
    status: SupplyStatus | None = None

    _dates = field_validator("expiry_date")(_sane_date)
    _received = field_validator("received_on")(_not_future)
    _clean_text = field_validator("lot_number", "manufacturer", "unit")(_clean)


class SupplyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    medication_id: uuid.UUID
    lot_number: str | None
    manufacturer: str | None
    expiry_date: date | None
    received_on: date | None
    unit: str | None
    quantity_initial: float
    quantity_remaining: float
    status: SupplyStatus


# --------------------------------------------------------------------------------- doses
class DoseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    medication_id: uuid.UUID
    schedule_id: uuid.UUID | None
    scheduled_at: datetime | None
    status: DoseStatus
    taken_at: datetime | None
    note: str | None
    supply_id: uuid.UUID | None
    units_used: float | None
    # Derived at read time, never stored: a pending dose past its grace window.
    overdue: bool = False
    medication_name: str | None = None
    dose_text: str | None = None


class DoseTakeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    taken_at: datetime | None = None  # defaults to now; the patient may back-date
    note: str | None = Field(default=None, max_length=500)

    _clean_text = field_validator("note")(_clean)

    @field_validator("taken_at")
    @classmethod
    def _aware(cls, v: datetime | None) -> datetime | None:
        if v is not None and v.tzinfo is None:
            raise ValueError("Include a time zone offset in taken_at.")
        return v


class DoseSkipIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    note: str | None = Field(default=None, max_length=500)

    _clean_text = field_validator("note")(_clean)


class AdHocDoseIn(DoseTakeIn):
    medication_id: uuid.UUID


# --------------------------------------------------------------------- alerts / feed
class AlertOut(BaseModel):
    kind: AlertKind
    medication_id: uuid.UUID
    medication_name: str
    supply_id: uuid.UUID | None = None
    lot_number: str | None = None
    expiry_date: date | None = None
    days_left: float | None = None
    remaining: float | None = None


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    kind: NotificationKind
    title: str
    body: str
    due_at: datetime
    delivered_at: datetime | None
    read_at: datetime | None
    dose_log_id: uuid.UUID | None
    medication_id: uuid.UUID | None
