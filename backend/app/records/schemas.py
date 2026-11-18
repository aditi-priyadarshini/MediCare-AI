import uuid
from datetime import date, datetime, timedelta
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

RecordType = Literal[
    "lab_report", "prescription", "imaging", "discharge_summary", "vaccination", "other"
]
RecordStatus = Literal["active", "entered_in_error"]
LabFlag = Literal["low", "normal", "high", "unknown"]


def _not_future(v: date | None) -> date | None:
    # One day of slack so a patient ahead of UTC (e.g. IST) can enter today's date.
    if v is not None and (v > date.today() + timedelta(days=1) or v.year < 1900):
        raise ValueError("Enter a valid date that is not in the future.")
    return v


def _clean(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    return v or None


class RecordIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    record_type: RecordType
    title: str = Field(min_length=1, max_length=200)
    record_date: date | None = None
    provider_name: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)

    _date = field_validator("record_date")(_not_future)

    @field_validator("title")
    @classmethod
    def _title(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Title is required.")
        return v

    _clean_text = field_validator("provider_name", "notes")(_clean)


class RecordPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    record_type: RecordType | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    record_date: date | None = None
    provider_name: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)
    status: RecordStatus | None = None

    _date = field_validator("record_date")(_not_future)
    _clean_text = field_validator("provider_name", "notes")(_clean)

    @field_validator("title")
    @classmethod
    def _title(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Title is required.")
        return v


class RecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    record_type: RecordType
    title: str
    record_date: date | None
    provider_name: str | None
    notes: str | None
    status: RecordStatus
    verification_status: str
    has_file: bool
    file_name: str | None
    file_content_type: str | None
    file_size: int | None
    created_at: datetime


class LabIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    record_id: uuid.UUID | None = None
    test_name: str = Field(min_length=1, max_length=120)
    value_numeric: float | None = Field(default=None, ge=-1e9, le=1e9)
    value_text: str | None = Field(default=None, max_length=200)
    unit: str | None = Field(default=None, max_length=32)
    ref_low: float | None = Field(default=None, ge=-1e9, le=1e9)
    ref_high: float | None = Field(default=None, ge=-1e9, le=1e9)
    observed_on: date
    notes: str | None = Field(default=None, max_length=1000)

    _date = field_validator("observed_on")(_not_future)
    _clean_text = field_validator("value_text", "unit", "notes")(_clean)

    @field_validator("test_name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("Test name is required.")
        return v


class LabPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    record_id: uuid.UUID | None = None
    test_name: str | None = Field(default=None, min_length=1, max_length=120)
    value_numeric: float | None = Field(default=None, ge=-1e9, le=1e9)
    value_text: str | None = Field(default=None, max_length=200)
    unit: str | None = Field(default=None, max_length=32)
    ref_low: float | None = Field(default=None, ge=-1e9, le=1e9)
    ref_high: float | None = Field(default=None, ge=-1e9, le=1e9)
    observed_on: date | None = None
    notes: str | None = Field(default=None, max_length=1000)
    status: RecordStatus | None = None

    _date = field_validator("observed_on")(_not_future)
    _clean_text = field_validator("value_text", "unit", "notes")(_clean)

    @field_validator("test_name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = " ".join(v.split())
        if not v:
            raise ValueError("Test name is required.")
        return v


class LabOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    record_id: uuid.UUID | None
    test_name: str
    value_numeric: float | None
    value_text: str | None
    unit: str | None
    ref_low: float | None
    ref_high: float | None
    flag: LabFlag
    observed_on: date
    notes: str | None
    status: RecordStatus
    verification_status: str


class LabTestSummary(BaseModel):
    test_name: str
    count: int
    latest_observed_on: date
    latest_value_numeric: float | None
    latest_value_text: str | None
    latest_unit: str | None
    latest_flag: LabFlag


class TrendPoint(BaseModel):
    id: uuid.UUID
    observed_on: date
    value: float
    flag: LabFlag


class LabTrend(BaseModel):
    test_name: str
    unit: str | None
    ref_low: float | None
    ref_high: float | None
    points: list[TrendPoint]


class LabBulkItem(LabIn):
    """One row of a bulk save. The report link is set once on the request, not per row."""

    record_id: None = None


class LabBulkIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    record_id: uuid.UUID | None = None
    items: list[LabBulkItem] = Field(min_length=1, max_length=60)


# ------------------------------------------------------------------------------------ scan
Confidence = Literal["high", "medium", "low"]


class ScanStatus(BaseModel):
    available: bool
    photos: bool
    pdf_text: bool
    scanned_pdf: bool


class ScanRecordDraft(BaseModel):
    record_type: RecordType | None
    title: str | None
    record_date: date | None
    date_ambiguous: bool
    provider_name: str | None


class ScanLabRow(BaseModel):
    test_name: str
    result: str
    unit: str | None
    ref_low: float | None
    ref_high: float | None
    confidence: Confidence
    source_line: str


class ScanOut(BaseModel):
    """A draft to pre-fill forms with. Nothing here has been saved."""

    method: Literal["pdf_text", "ocr", "pdf_ocr"]
    pages_read: int
    pages_total: int
    text_found: bool
    record: ScanRecordDraft
    labs: list[ScanLabRow]
    warnings: list[str]
