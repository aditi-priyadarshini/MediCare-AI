"""Pure safety-check logic: no database, no clock, no I/O.

Hard rules encoded here (docs/SECURITY.md section 8):
- Outcomes are only ``findings``, ``no_matching_record`` or ``insufficient_data``. There is no
  "safe" outcome: finding nothing in a limited dataset is not evidence of safety.
- Every finding carries its source, version, jurisdiction and review date.
- Two rules for the same pair that disagree on severity are both shown and flagged, never merged.
- A medicine that cannot be mapped to ingredients makes the answer "insufficient data".
"""

import re
from dataclasses import dataclass, field
from datetime import date

FINDINGS = "findings"
NO_MATCH = "no_matching_record"
INSUFFICIENT = "insufficient_data"

SEVERITY_RANK = {"contraindicated": 4, "major": 3, "moderate": 2, "minor": 1, "unknown": 0}

NO_MATCH_NOTE = (
    "No matching record in this dataset. The dataset is limited, so this does not mean there is "
    "no interaction or risk."
)
REVIEW_NOTE = (
    "Ask a pharmacist or the prescriber about anything here before changing what you take."
)


@dataclass(frozen=True)
class Source:
    name: str
    version: str
    reviewed_at: date
    jurisdiction: str


@dataclass(frozen=True)
class Ingredient:
    id: str
    name: str
    drug_class: str | None
    allergy_terms: tuple[str, ...]
    source: Source


@dataclass(frozen=True)
class Rule:
    id: str
    kind: str
    ingredient_id: str
    counterpart_ingredient_id: str | None
    counterpart_term: str | None
    severity: str
    description: str
    clinical_significance: str | None
    guidance: str | None
    source: Source


@dataclass(frozen=True)
class PatientMed:
    id: str
    name: str
    ingredient_ids: tuple[str, ...]  # empty = could not be mapped to ingredients


@dataclass(frozen=True)
class PatientTerm:
    """A condition or allergy as the patient recorded it."""

    id: str
    text: str
    code: str | None = None
    severity: str | None = None


@dataclass
class Finding:
    rule_id: str
    kind: str
    severity: str
    description: str
    clinical_significance: str | None
    guidance: str | None
    source: Source
    medication_ids: list[str]
    medication_names: list[str]
    ingredient_names: list[str]
    matched_term: str | None = None
    conflict: bool = False  # another rule for the same subject disagrees on severity


@dataclass
class AllergyFinding:
    allergy_id: str
    allergy_text: str
    allergy_severity: str | None
    medication_id: str
    medication_name: str
    ingredient_name: str
    basis: str  # ingredient_name | curated_term | drug_class
    source: Source


@dataclass
class Duplicate:
    ingredient_name: str
    medication_ids: list[str]
    medication_names: list[str]


@dataclass
class CheckResult:
    outcome: str
    findings: list[Finding] = field(default_factory=list)
    allergy_findings: list[AllergyFinding] = field(default_factory=list)
    duplicates: list[Duplicate] = field(default_factory=list)
    unmapped_medications: list[str] = field(default_factory=list)  # names
    checked_medications: int = 0
    notes: list[str] = field(default_factory=list)


def normalize(text: str) -> str:
    """Lower-case, punctuation to spaces, single spaces. Used for every term comparison."""
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text.casefold()).split())


def _stem(word: str) -> str:
    """Drop a plural 's' so "NSAIDs" meets "nsaid" (applied to both sides, so it only has to
    be consistent)."""
    return word[:-1] if len(word) > 3 and word.endswith("s") and not word.endswith("ss") else word


# Words people commonly write that mean the same as a curated rule term.
_SYNONYMS = {"pregnant": "pregnancy"}


def _words(text: str) -> str:
    return " ".join(_SYNONYMS.get(w, _stem(w)) for w in normalize(text).split())


def contains_term(text: str, term: str) -> bool:
    """True when ``term`` appears in ``text`` as whole words ("kidney" in "chronic kidney
    disease", but not "pre" in "pregnant"). Plurals match their singular."""
    t, x = _words(term), _words(text)
    return bool(t) and f" {t} " in f" {x} "


def canonical_pair(a: str, b: str) -> tuple[str, str]:
    return (a, b) if a < b else (b, a)


def _split(meds: list[PatientMed]) -> tuple[list[PatientMed], list[str]]:
    mapped = [m for m in meds if m.ingredient_ids]
    return mapped, [m.name for m in meds if not m.ingredient_ids]


def _sort(findings: list[Finding]) -> list[Finding]:
    return sorted(findings, key=lambda f: (-SEVERITY_RANK[f.severity], f.description))


def _flag_conflicts(findings: list[Finding], subject) -> None:
    groups: dict[object, list[Finding]] = {}
    for f in findings:
        groups.setdefault(subject(f), []).append(f)
    for group in groups.values():
        if len({f.severity for f in group}) > 1:
            for f in group:
                f.conflict = True


def _outcome(findings: list, mapped: list[PatientMed], unmapped: list[str], *, enough: bool) -> str:
    if findings:
        return FINDINGS
    if not enough or not mapped or unmapped:
        return INSUFFICIENT
    return NO_MATCH


def check_drug_drug(
    meds: list[PatientMed], rules: list[Rule], ingredients: dict[str, Ingredient]
) -> CheckResult:
    mapped, unmapped = _split(meds)
    result = CheckResult(outcome=INSUFFICIENT, unmapped_medications=unmapped)
    result.checked_medications = len(mapped)

    by_pair: dict[tuple[str, str], list[Rule]] = {}
    for r in rules:
        if r.kind == "drug_drug" and r.counterpart_ingredient_id:
            by_pair.setdefault(
                canonical_pair(r.ingredient_id, r.counterpart_ingredient_id), []
            ).append(r)

    seen: set[tuple[str, str, str]] = set()
    for i, m1 in enumerate(mapped):
        for m2 in mapped[i + 1 :]:
            for x in m1.ingredient_ids:
                for y in m2.ingredient_ids:
                    if x == y:
                        continue
                    pair = canonical_pair(x, y)
                    for r in by_pair.get(pair, []):
                        key = (r.id, *sorted((m1.id, m2.id)))
                        if key in seen:
                            continue
                        seen.add(key)
                        result.findings.append(
                            Finding(
                                rule_id=r.id,
                                kind=r.kind,
                                severity=r.severity,
                                description=r.description,
                                clinical_significance=r.clinical_significance,
                                guidance=r.guidance,
                                source=r.source,
                                medication_ids=[m1.id, m2.id],
                                medication_names=[m1.name, m2.name],
                                ingredient_names=[ingredients[x].name, ingredients[y].name],
                            )
                        )
    _flag_conflicts(
        result.findings,
        lambda f: tuple(sorted(f.medication_ids)) + tuple(sorted(f.ingredient_names)),
    )
    result.findings = _sort(result.findings)

    # The same ingredient in two medicines is derived from the catalogue, not from a rule.
    holders: dict[str, list[PatientMed]] = {}
    for m in mapped:
        for ing in set(m.ingredient_ids):
            holders.setdefault(ing, []).append(m)
    for ing, group in holders.items():
        if len(group) > 1:
            result.duplicates.append(
                Duplicate(ingredients[ing].name, [m.id for m in group], [m.name for m in group])
            )
    result.duplicates.sort(key=lambda d: d.ingredient_name)

    result.outcome = _outcome(result.findings, mapped, unmapped, enough=len(meds) >= 2)
    if len(meds) < 2:
        result.notes.append("Add at least two medicines to check for interactions between them.")
    _finish_notes(result)
    return result


def check_by_term(
    meds: list[PatientMed],
    rules: list[Rule],
    ingredients: dict[str, Ingredient],
    kind: str,
    terms: list[PatientTerm] | None,
) -> CheckResult:
    """drug_condition (terms = the patient's conditions) or drug_food (terms = foods the patient
    typed; None lists every food note for the medicines)."""
    mapped, unmapped = _split(meds)
    result = CheckResult(outcome=INSUFFICIENT, unmapped_medications=unmapped)
    result.checked_medications = len(mapped)
    wanted = [r for r in rules if r.kind == kind]
    for m in mapped:
        for ing in m.ingredient_ids:
            for r in wanted:
                if r.ingredient_id != ing or r.counterpart_term is None:
                    continue
                if terms is None:
                    matched = r.counterpart_term
                else:
                    hit = next(
                        (
                            t
                            for t in terms
                            if contains_term(t.text, r.counterpart_term)
                            or (t.code and normalize(t.code) == normalize(r.counterpart_term))
                        ),
                        None,
                    )
                    if hit is None:
                        continue
                    matched = hit.text
                result.findings.append(
                    Finding(
                        rule_id=r.id,
                        kind=r.kind,
                        severity=r.severity,
                        description=r.description,
                        clinical_significance=r.clinical_significance,
                        guidance=r.guidance,
                        source=r.source,
                        medication_ids=[m.id],
                        medication_names=[m.name],
                        ingredient_names=[ingredients[ing].name],
                        matched_term=matched,
                    )
                )
    _flag_conflicts(
        result.findings, lambda f: (f.medication_ids[0], f.ingredient_names[0], f.matched_term)
    )
    result.findings = _sort(result.findings)
    has_input = bool(terms) if terms is not None else True
    result.outcome = _outcome(result.findings, mapped, unmapped, enough=has_input)
    if terms is not None and not terms:
        what = "conditions" if kind == "drug_condition" else "foods"
        result.notes.append(f"No {what} were provided, so nothing could be checked.")
    _finish_notes(result)
    return result


def check_allergies(
    meds: list[PatientMed], ingredients: dict[str, Ingredient], allergies: list[PatientTerm]
) -> CheckResult:
    mapped, unmapped = _split(meds)
    result = CheckResult(outcome=INSUFFICIENT, unmapped_medications=unmapped)
    result.checked_medications = len(mapped)
    for a in allergies:
        for m in mapped:
            for ing_id in m.ingredient_ids:
                ing = ingredients[ing_id]
                basis = None
                if contains_term(a.text, ing.name):
                    basis = "ingredient_name"
                elif any(contains_term(a.text, t) for t in ing.allergy_terms):
                    basis = "curated_term"
                elif ing.drug_class and contains_term(a.text, ing.drug_class):
                    basis = "drug_class"
                if basis:
                    result.allergy_findings.append(
                        AllergyFinding(
                            allergy_id=a.id,
                            allergy_text=a.text,
                            allergy_severity=a.severity,
                            medication_id=m.id,
                            medication_name=m.name,
                            ingredient_name=ing.name,
                            basis=basis,
                            source=ing.source,
                        )
                    )
    result.outcome = _outcome(result.allergy_findings, mapped, unmapped, enough=bool(allergies))
    if not allergies:
        result.notes.append(
            "No allergies are recorded. That means unknown, not that you have no allergies."
        )
    _finish_notes(result)
    return result


def finish_notes(result: CheckResult) -> None:
    """Add the standard closing notes for a result's outcome (public for the assessment code)."""
    _finish_notes(result)


def _finish_notes(result: CheckResult) -> None:
    if result.unmapped_medications:
        result.notes.append(
            "These medicines could not be matched to active ingredients, so they were not "
            "checked: " + ", ".join(sorted(result.unmapped_medications)) + "."
        )
    if result.outcome == NO_MATCH:
        result.notes.append(NO_MATCH_NOTE)
    if result.outcome == FINDINGS:
        result.notes.append(REVIEW_NOTE)
