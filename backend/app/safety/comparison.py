"""Generic-candidate matching and price normalisation. Pure functions.

A candidate is a catalogue entry with the same active ingredients, the same strength of each
(same unit: no conversion is attempted), the same dosage form, route and release type. It is a
candidate for a conversation with a pharmacist or prescriber, never a substitution.
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

STALE_AFTER_DAYS = 90

CANDIDATE_NOTE = (
    "These are candidates that match on ingredient, strength, form, route and release type in "
    "this dataset. They are not substitutes. A pharmacist or prescriber must confirm before "
    "you switch anything."
)
PRICE_NOTE = (
    "Prices are reported by the named source at the time shown and may have changed. Only "
    "prices with a source, pack size, jurisdiction and time are listed; unit prices are only "
    "comparable within the same currency, jurisdiction and pack unit."
)


@dataclass(frozen=True)
class Component:
    ingredient_id: str
    strength_value: Decimal | None
    strength_unit: str | None


@dataclass(frozen=True)
class Composition:
    medicine_id: str
    name: str
    form: str | None
    strength_text: str | None
    route: str | None
    release_type: str | None
    components: tuple[Component, ...]


@dataclass
class Candidate:
    composition: Composition
    differences: list[str] = field(default_factory=list)


@dataclass
class CandidateResult:
    status: str  # candidates | no_candidates | insufficient_data
    candidates: list[Candidate] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)  # what is missing on the source medicine
    excluded_incomplete: int = 0  # entries skipped because their own data is incomplete


def missing_fields(c: Composition) -> list[str]:
    out = []
    if not c.components:
        out.append("active ingredients")
    elif any(x.strength_value is None or not x.strength_unit for x in c.components):
        out.append("ingredient strengths")
    for label, value in (
        ("dosage form", c.form),
        ("route", c.route),
        ("release type", c.release_type),
    ):
        if not value:
            out.append(label)
    return out


def _signature(c: Composition) -> tuple:
    comps = tuple(
        sorted(
            (
                x.ingredient_id,
                Decimal(x.strength_value).normalize(),
                (x.strength_unit or "").casefold(),
            )
            for x in c.components
        )
    )
    return (
        comps,
        (c.form or "").casefold(),
        (c.route or "").casefold(),
        (c.release_type or "").casefold(),
    )


def find_candidates(source: Composition, pool: list[Composition]) -> CandidateResult:
    missing = missing_fields(source)
    if missing:
        return CandidateResult("insufficient_data", missing=missing)
    want = _signature(source)
    result = CandidateResult("no_candidates")
    for c in pool:
        if c.medicine_id == source.medicine_id:
            continue
        if missing_fields(c):
            result.excluded_incomplete += 1
            continue
        if _signature(c) != want:
            continue
        diffs = []
        if c.name.casefold() != source.name.casefold():
            diffs.append("Different product name")
        if (c.strength_text or "") != (source.strength_text or ""):
            diffs.append("Strength is written differently")
        result.candidates.append(Candidate(c, diffs))
    result.candidates.sort(key=lambda x: x.composition.name.casefold())
    if result.candidates:
        result.status = "candidates"
    return result


def unit_price(price: Decimal, pack_quantity: Decimal) -> Decimal:
    return (Decimal(price) / Decimal(pack_quantity)).quantize(Decimal("0.0001"), ROUND_HALF_UP)


def age_days(observed_at: datetime, now: datetime | None = None) -> int:
    now = now or datetime.now(UTC)
    return max(0, (now - observed_at).days)
