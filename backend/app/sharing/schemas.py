import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

ShareCategory = Literal["profile", "conditions", "allergies", "medications", "labs", "records"]
ShareStatus = Literal["active", "expired", "revoked"]
ShareEvent = Literal[
    "code_sent", "code_failed", "verified", "viewed", "blocked_revoked", "blocked_expired"
]


class ShareScopeIn(BaseModel):
    """What would be shown. The date range applies to lab results and records."""

    model_config = ConfigDict(extra="forbid")
    categories: list[ShareCategory] = Field(min_length=1, max_length=6)
    date_from: date | None = None
    date_to: date | None = None

    @field_validator("categories")
    @classmethod
    def _unique(cls, v: list[str]) -> list[str]:
        return list(dict.fromkeys(v))

    @model_validator(mode="after")
    def _dates(self):
        if self.date_from and self.date_to and self.date_from > self.date_to:
            raise ValueError("The start date cannot be after the end date.")
        return self


class ShareCreateIn(ShareScopeIn):
    recipient_name: str = Field(min_length=1, max_length=120)
    recipient_email: EmailStr
    expires_in_hours: int = Field(default=72, ge=1, le=720)
    # The patient must tick "I have reviewed what will be shared": a missing or false value is
    # rejected, so a share can never be created by accident or by a client that skipped review.
    confirm: Literal[True]

    @field_validator("recipient_name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Enter the recipient's name.")
        return v


class ShareOut(BaseModel):
    id: uuid.UUID
    recipient_name: str
    recipient_email: str
    categories: list[ShareCategory]
    date_from: date | None
    date_to: date | None
    expires_at: datetime
    revoked_at: datetime | None
    created_at: datetime
    last_accessed_at: datetime | None
    access_count: int
    notified_at: datetime | None
    status: ShareStatus


class ShareCreated(BaseModel):
    share: ShareOut
    # Shown once: only a hash is stored, so the link cannot be shown again.
    link: str
    notification_sent: bool


class AccessLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    event: ShareEvent
    created_at: datetime


# ------------------------------------------------------------------- recipient side
class TokenIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str = Field(min_length=20, max_length=200)


class VerifyIn(TokenIn):
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class StartOut(BaseModel):
    message: str


class SessionOut(BaseModel):
    session_token: str
    expires_in_seconds: int


class SummaryProfile(BaseModel):
    display_name: str
    date_of_birth: date | None
    blood_group: str | None
    blood_group_verification_status: str


class SummaryCondition(BaseModel):
    display_name: str
    status: str
    onset_date: date | None
    verification_status: str


class SummaryAllergy(BaseModel):
    substance: str
    reaction: str | None
    severity: str | None
    verification_status: str


class SummaryMedication(BaseModel):
    display_name: str
    strength_text: str | None
    form: str | None
    dose_text: str | None
    instructions: str | None
    as_needed: bool
    basis: str
    status: str
    start_date: date | None
    end_date: date | None
    verification_status: str


class SummaryLab(BaseModel):
    test_name: str
    value_numeric: float | None
    value_text: str | None
    unit: str | None
    ref_low: float | None
    ref_high: float | None
    flag: str
    observed_on: date
    verification_status: str


class SummaryRecord(BaseModel):
    title: str
    record_type: str
    record_date: date | None
    provider_name: str | None
    verification_status: str
    has_file: bool


class SharedSummary(BaseModel):
    """Everything is optional by category: a category that was not shared is None, not empty."""

    generated_at: datetime
    categories: list[ShareCategory]
    date_from: date | None
    date_to: date | None
    profile: SummaryProfile | None = None
    conditions: list[SummaryCondition] | None = None
    allergies: list[SummaryAllergy] | None = None
    medications: list[SummaryMedication] | None = None
    labs: list[SummaryLab] | None = None
    records: list[SummaryRecord] | None = None
    limitations: list[str]


class SharedView(BaseModel):
    shared_by: str
    recipient_name: str
    expires_at: datetime
    summary: SharedSummary
