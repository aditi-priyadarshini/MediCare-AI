import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Severity = Literal["unknown", "minor", "moderate", "major", "contraindicated"]
RuleKind = Literal["drug_drug", "drug_food", "drug_condition"]
Outcome = Literal["findings", "no_matching_record", "insufficient_data"]
AdrSeverity = Literal["mild", "moderate", "severe"]
AdrOutcome = Literal["recovered", "ongoing", "unknown"]

SAFETY_DISCLAIMER = (
    "This is a limited reference dataset, not medical advice. Finding nothing here does not "
    "mean a combination is safe. Talk to a pharmacist or your prescriber before starting, "
    "stopping or changing any medicine."
)
ADR_NOTICE = (
    "This records what you noticed. It does not show that a medicine caused it. It is not sent "
    "to any regulator or doctor. If you feel very unwell, get medical help now."
)


def _clean(v: str | None) -> str | None:
    if v is None:
        return None
    v = " ".join(v.split())
    return v or None


def _not_future(v: date | None) -> date | None:
    # One day of slack so a patient ahead of UTC (e.g. IST) can enter today's date.
    if v is not None and (v.year < 1900 or (v - date.today()).days > 1):
        raise ValueError("Enter a valid date that is not in the future.")
    return v


# ------------------------------------------------------------------------------- results
class SourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    name: str
    version: str
    reviewed_at: date
    jurisdiction: str


class FindingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    rule_id: str
    kind: RuleKind
    severity: Severity
    description: str
    clinical_significance: str | None
    guidance: str | None
    source: SourceOut
    medication_ids: list[str]
    medication_names: list[str]
    ingredient_names: list[str]
    matched_term: str | None
    conflict: bool


class AllergyFindingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    allergy_id: str
    allergy_text: str
    allergy_severity: str | None
    medication_id: str
    medication_name: str
    ingredient_name: str
    basis: Literal["ingredient_name", "curated_term", "drug_class"]
    source: SourceOut


class DuplicateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    ingredient_name: str
    medication_ids: list[str]
    medication_names: list[str]


class CheckOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    outcome: Outcome
    findings: list[FindingOut]
    allergy_findings: list[AllergyFindingOut]
    duplicates: list[DuplicateOut]
    unmapped_medications: list[str]
    checked_medications: int
    notes: list[str]
    disclaimer: str = SAFETY_DISCLAIMER


class CheckIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    medication_ids: list[uuid.UUID] | None = Field(default=None, max_length=50)


class FoodCheckIn(CheckIn):
    foods: list[str] | None = Field(default=None, max_length=20)

    @field_validator("foods")
    @classmethod
    def _foods(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        cleaned = [c for c in (_clean(x) for x in v) if c]
        if any(len(c) > 60 for c in cleaned):
            raise ValueError("Each food must be 60 characters or fewer.")
        return cleaned


class WarningsOut(BaseModel):
    medicine_id: uuid.UUID
    medicine_name: str
    ingredients: list[str]
    rules: list[FindingOut]
    notes: list[str]
    disclaimer: str = SAFETY_DISCLAIMER


# ------------------------------------------------------------------------- authenticity
class AuthenticityIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    supply_id: uuid.UUID | None = None
    barcode: str | None = Field(default=None, max_length=64)
    lot_number: str | None = Field(default=None, max_length=64)

    _c = field_validator("barcode", "lot_number")(_clean)

    @model_validator(mode="after")
    def _something(self):
        if not (self.supply_id or self.barcode or self.lot_number):
            raise ValueError("Provide a supply, a barcode or a lot number.")
        return self


class AuthenticityOut(BaseModel):
    status: Literal["verified", "mismatch", "suspicious_for_review", "unable_to_verify"]
    detail: str
    source: str | None
    checked_at: datetime
    note: str


# ------------------------------------------------------------------- adverse event reports
class AdverseIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    medication_id: uuid.UUID | None = None
    medication_name: str | None = Field(default=None, max_length=120)
    reaction: str = Field(min_length=3, max_length=2000)
    onset_date: date | None = None
    severity: AdrSeverity
    outcome: AdrOutcome = "unknown"
    notes: str | None = Field(default=None, max_length=2000)
    record_id: uuid.UUID | None = None

    _c = field_validator("medication_name", "reaction", "notes")(_clean)
    _d = field_validator("onset_date")(_not_future)

    @model_validator(mode="after")
    def _which_medicine(self):
        if not (self.medication_id or self.medication_name):
            raise ValueError("Say which medicine this was about.")
        return self


class AdverseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    medication_id: uuid.UUID | None
    medication_name: str
    reaction: str
    onset_date: date | None
    severity: AdrSeverity
    outcome: AdrOutcome
    notes: str | None
    record_id: uuid.UUID | None
    status: Literal["submitted", "entered_in_error"]
    created_at: datetime
    notice: str = ADR_NOTICE


# ----------------------------------------------------------------------- alternatives
class PriceOut(BaseModel):
    source_name: str
    price: Decimal
    currency: str
    pack_quantity: Decimal
    pack_unit: str
    unit_price: Decimal
    jurisdiction: str
    observed_at: datetime
    age_days: int
    stale: bool


class IngredientBrief(BaseModel):
    name: str
    strength_value: Decimal | None
    strength_unit: str | None


class MedicineCard(BaseModel):
    id: uuid.UUID
    name: str
    form: str | None
    strength_text: str | None
    route: str | None
    release_type: str | None
    ingredients: list[IngredientBrief]
    prices: list[PriceOut]


class CandidateOut(BaseModel):
    medicine: MedicineCard
    differences: list[str]
    label: Literal["candidate"] = "candidate"


class AlternativesOut(BaseModel):
    subject: MedicineCard
    status: Literal["candidates", "no_candidates", "insufficient_data"]
    candidates: list[CandidateOut]
    missing: list[str]
    excluded_incomplete: int
    notice: str
    price_notice: str


# ---------------------------------------------------------------------------------- admin
class SourceIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=2, max_length=200)
    publisher: str | None = Field(default=None, max_length=200)
    url: str | None = Field(default=None, max_length=500)
    licence: str | None = Field(default=None, max_length=200)
    jurisdiction: str = Field(min_length=2, max_length=16)
    version: str = Field(min_length=1, max_length=32)
    reviewed_at: date

    _c = field_validator("name", "publisher", "url", "licence", "jurisdiction", "version")(_clean)
    _d = field_validator("reviewed_at")(_not_future)


class SourceOut2(SourceIn):
    model_config = ConfigDict(from_attributes=True, extra="ignore")
    id: uuid.UUID


class IngredientIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=2, max_length=120)
    drug_class: str | None = Field(default=None, max_length=80)
    allergy_terms: list[str] = Field(default_factory=list, max_length=20)
    source_id: uuid.UUID

    _c = field_validator("name", "drug_class")(_clean)

    @field_validator("allergy_terms")
    @classmethod
    def _terms(cls, v: list[str]) -> list[str]:
        return sorted({t.casefold() for t in (_clean(x) for x in v) if t})


class IngredientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    drug_class: str | None
    allergy_terms: list[str]
    source_id: uuid.UUID


class ComponentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ingredient_id: uuid.UUID
    strength_value: Decimal | None = Field(default=None, gt=0, le=1_000_000)
    strength_unit: str | None = Field(default=None, max_length=16)

    _c = field_validator("strength_unit")(_clean)

    @model_validator(mode="after")
    def _both(self):
        if (self.strength_value is None) != (self.strength_unit is None):
            raise ValueError("Give both a strength value and its unit, or neither.")
        return self


class CompositionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    route: str | None = Field(default=None, max_length=24)
    release_type: str | None = Field(default=None, max_length=24)
    ingredients: list[ComponentIn] = Field(min_length=1, max_length=10)

    _c = field_validator("route", "release_type")(_clean)

    @model_validator(mode="after")
    def _unique(self):
        ids = [i.ingredient_id for i in self.ingredients]
        if len(ids) != len(set(ids)):
            raise ValueError("Each ingredient can appear only once.")
        return self


class RuleIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: RuleKind
    ingredient_id: uuid.UUID
    counterpart_ingredient_id: uuid.UUID | None = None
    counterpart_term: str | None = Field(default=None, max_length=80)
    severity: Severity
    description: str = Field(min_length=5, max_length=1000)
    clinical_significance: str | None = Field(default=None, max_length=1000)
    guidance: str | None = Field(default=None, max_length=1000)
    source_id: uuid.UUID
    source_version: str = Field(min_length=1, max_length=32)
    reviewed_at: date
    jurisdiction: str = Field(min_length=2, max_length=16)

    _c = field_validator(
        "counterpart_term", "description", "clinical_significance", "guidance", "jurisdiction"
    )(_clean)
    _d = field_validator("reviewed_at")(_not_future)

    @model_validator(mode="after")
    def _shape(self):
        if self.kind == "drug_drug":
            if not self.counterpart_ingredient_id or self.counterpart_term:
                raise ValueError("A drug-drug rule needs a second ingredient and no term.")
            if self.counterpart_ingredient_id == self.ingredient_id:
                raise ValueError("The two ingredients must differ.")
        elif self.counterpart_ingredient_id or not self.counterpart_term:
            raise ValueError("A food or condition rule needs a term and no second ingredient.")
        return self


class RuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    kind: RuleKind
    ingredient_id: uuid.UUID
    counterpart_ingredient_id: uuid.UUID | None
    counterpart_term: str | None
    severity: Severity
    description: str
    clinical_significance: str | None
    guidance: str | None
    source_id: uuid.UUID
    source_version: str
    reviewed_at: date
    jurisdiction: str
    status: Literal["active", "retired"]
    retired_at: datetime | None
    created_at: datetime


class PriceIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_name: str = Field(min_length=2, max_length=120)
    price: Decimal = Field(gt=0, le=10_000_000, decimal_places=2)
    currency: str = Field(min_length=3, max_length=3, pattern=r"^[A-Za-z]{3}$")
    pack_quantity: Decimal = Field(gt=0, le=100_000, decimal_places=2)
    pack_unit: str = Field(min_length=1, max_length=16)
    jurisdiction: str = Field(min_length=2, max_length=16)
    observed_at: datetime

    _c = field_validator("source_name", "pack_unit", "jurisdiction")(_clean)

    @field_validator("currency")
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.upper()

    @field_validator("observed_at")
    @classmethod
    def _aware_past(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ValueError("Include a time zone, e.g. 2026-11-15T10:00:00+05:30.")
        if v > datetime.now(UTC):
            raise ValueError("The observation time cannot be in the future.")
        return v
