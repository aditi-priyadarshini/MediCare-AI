import uuid
from datetime import date, datetime
from typing import Literal
from zoneinfo import available_timezones

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

Language = Literal["en", "hi", "or"]
BloodGroup = Literal["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
_TIMEZONES = available_timezones()


class AccessibilityPrefs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    large_text: bool = False
    high_contrast: bool = False
    reduce_motion: bool = False
    voice_enabled: bool = False


class ProfileIn(BaseModel):
    """Mutable profile fields. The client never supplies verification status."""

    model_config = ConfigDict(extra="forbid")
    display_name: str = Field(min_length=1, max_length=120)
    date_of_birth: date | None = None
    preferred_language: Language = "en"
    timezone: str = "Asia/Kolkata"
    height_cm: float | None = Field(default=None, ge=30, le=272)
    weight_kg: float | None = Field(default=None, ge=1, le=500)
    blood_group: BloodGroup | None = None
    accessibility_preferences: AccessibilityPrefs = AccessibilityPrefs()

    @field_validator("display_name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name is required.")
        return v

    @field_validator("date_of_birth")
    @classmethod
    def _dob(cls, v: date | None) -> date | None:
        if v and (v > date.today() or v.year < 1900):
            raise ValueError("Enter a valid date of birth.")
        return v

    @field_validator("timezone")
    @classmethod
    def _tz(cls, v: str) -> str:
        if v not in _TIMEZONES:
            raise ValueError("Unknown timezone.")
        return v


class ProfileOut(BaseModel):
    display_name: str
    date_of_birth: date | None
    preferred_language: str
    timezone: str
    height_cm: float | None
    weight_kg: float | None
    blood_group: str | None
    blood_group_verification_status: str
    accessibility_preferences: AccessibilityPrefs
    onboarding_completed: bool
    completeness: int  # 0-100: share of optional profile sections filled in


ConditionStatus = Literal["active", "resolved", "inactive", "entered_in_error"]


class ConditionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    display_name: str = Field(min_length=1, max_length=200)
    status: ConditionStatus = "active"
    onset_date: date | None = None
    resolved_date: date | None = None

    @model_validator(mode="after")
    def _dates(self):
        if self.onset_date and self.resolved_date and self.resolved_date < self.onset_date:
            raise ValueError("Resolved date cannot be before onset date.")
        return self


class ConditionPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    display_name: str | None = Field(default=None, min_length=1, max_length=200)
    status: ConditionStatus | None = None
    onset_date: date | None = None
    resolved_date: date | None = None


class ConditionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    display_name: str
    status: str
    verification_status: str
    onset_date: date | None
    resolved_date: date | None
    created_at: datetime
    updated_at: datetime


Severity = Literal["mild", "moderate", "severe", "unknown"]


class AllergyIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    substance: str = Field(min_length=1, max_length=200)
    reaction: str | None = Field(default=None, max_length=300)
    severity: Severity | None = None


class AllergyPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    substance: str | None = Field(default=None, min_length=1, max_length=200)
    reaction: str | None = Field(default=None, max_length=300)
    severity: Severity | None = None
    status: Literal["active", "entered_in_error"] | None = None


class AllergyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    substance: str
    reaction: str | None
    severity: str | None
    verification_status: str
    source: str
    status: str
    created_at: datetime
    updated_at: datetime


E164 = r"^\+[1-9]\d{7,14}$"


class ContactIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120)
    relationship: str | None = Field(default=None, max_length=60)
    phone_e164: str = Field(pattern=E164)
    email: EmailStr | None = None
    is_primary: bool = False


class ContactPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=120)
    relationship: str | None = Field(default=None, max_length=60)
    phone_e164: str | None = Field(default=None, pattern=E164)
    email: EmailStr | None = None
    is_primary: bool | None = None


class ContactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    relationship: str | None
    phone_e164: str
    email: str | None
    is_primary: bool


ConsentType = Literal[
    "terms_of_service",
    "privacy_policy",
    "health_data_processing",
    "ai_context",
    "reminder_email",
    "reminder_call",
]
REQUIRED_CONSENTS: tuple[str, ...] = (
    "terms_of_service",
    "privacy_policy",
    "health_data_processing",
)
CURRENT_POLICY_VERSION = "2026-11-14"


class ConsentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    granted: bool


class ConsentOut(BaseModel):
    consent_type: str
    granted: bool
    policy_version: str | None
    recorded_at: datetime | None
    required: bool
