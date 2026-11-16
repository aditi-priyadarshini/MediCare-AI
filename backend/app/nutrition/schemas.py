import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.nutrition.models import CUISINES, DIET_TYPES, SITUATIONS

DietType = Literal["no_restriction", "vegetarian", "eggetarian", "pescatarian", "vegan", "jain"]
Cuisine = Literal["general", "north_indian", "south_indian", "east_indian", "western_indian"]
Situation = Literal[
    "pregnant_or_breastfeeding",
    "kidney_disease",
    "eating_disorder_history",
    "child_under_12",
    "clinician_diet",
]

# Import-time consistency check (an explicit raise survives `python -O`, unlike assert).
for _values, _type in ((DIET_TYPES, DietType), (CUISINES, Cuisine), (SITUATIONS, Situation)):
    if set(_values) != set(_type.__args__):  # type: ignore[attr-defined]
        raise RuntimeError(f"{_type} and its value list have drifted apart")


class FlagOut(BaseModel):
    code: str
    severity: Literal["block", "review", "info"]
    message: str


class PreferencesIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    diet_type: DietType
    cuisine: Cuisine = "general"
    meals_per_day: int = Field(default=3, ge=2, le=5)
    avoid_foods: list[str] = Field(default_factory=list, max_length=20)
    situations: list[Situation] = Field(default_factory=list, max_length=5)

    @field_validator("avoid_foods")
    @classmethod
    def _avoid(cls, v: list[str]) -> list[str]:
        out: list[str] = []
        for raw in v:
            item = " ".join(raw.split()).lower()
            if not item:
                continue
            if len(item) > 40:
                raise ValueError("Each food must be at most 40 characters.")
            if item not in out:
                out.append(item)
        return out

    @field_validator("situations")
    @classmethod
    def _unique(cls, v: list[str]) -> list[str]:
        return list(dict.fromkeys(v))


class PreferencesOut(PreferencesIn):
    saved: bool
    review_flags: list[FlagOut]
    notice: str
    updated_at: datetime | None = None


class PlanIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str | None = Field(default=None, max_length=120)

    @field_validator("title")
    @classmethod
    def _title(cls, v: str | None) -> str | None:
        v = " ".join((v or "").split())
        return v or None


class PlanSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    title: str
    created_at: datetime
    catalogue_version: str


class PlanOut(PlanSummary):
    constraints_used: dict
    review_flags: list[FlagOut]
    days: list[dict]
    limitations: list[str]
    notice: str
