"""Pure personalised-assessment logic on top of the engine's check results. No database, no I/O.

The overall status keeps the engine's honesty rules (docs/SECURITY.md section 8):

- There is no "safe" status. The calmest one is ``no_matching_record``.
- ``needs_attention`` means at least one serious note (major or contraindicated), or a possible
  allergy match. ``review`` means there are notes, but none of them is serious.
- Anything that could not be checked (a medicine with no known ingredients, nothing to compare
  against) leaves the status at ``insufficient_data`` unless a real finding exists.
"""

from dataclasses import dataclass

from app.safety import engine as eng

NEEDS_ATTENTION = "needs_attention"
REVIEW = "review"
NO_MATCH = eng.NO_MATCH
INSUFFICIENT = eng.INSUFFICIENT

SERIOUS = {"major", "contraindicated"}

SECTION_LABELS = {
    "drug_drug": "Interaction",
    "drug_condition": "Health condition",
    "drug_food": "Food and drink",
    "allergy": "Allergy",
    "duplicate": "Same ingredient twice",
}
FREQUENCY_RANK = {"very_common": 4, "common": 3, "uncommon": 2, "rare": 1, "unknown": 0}
SERIOUSNESS_RANK = {"serious": 2, "moderate": 1, "mild": 0}


@dataclass(frozen=True)
class Effect:
    id: str
    ingredient_id: str
    ingredient_name: str
    effect: str
    frequency: str
    seriousness: str
    when_to_get_help: str | None
    source: eng.Source


@dataclass
class Issue:
    """One thing worth the patient's attention, flattened from any of the checks."""

    section: str  # drug_drug | drug_condition | drug_food | allergy | duplicate
    severity: str  # engine severity scale
    title: str
    detail: str
    guidance: str | None
    medication_names: list[str]
    source: eng.Source | None


def status_for(results: list[eng.CheckResult]) -> str:
    """Overall status across several check results."""
    findings = [f for r in results for f in r.findings]
    allergies = [a for r in results for a in r.allergy_findings]
    duplicates = [d for r in results for d in r.duplicates]
    if allergies or any(f.severity in SERIOUS for f in findings):
        return NEEDS_ATTENTION
    if findings or duplicates:
        return REVIEW
    if any(r.outcome == eng.NO_MATCH for r in results):
        return NO_MATCH
    return INSUFFICIENT


def _allergy_severity(text: str | None) -> str:
    # A recorded severe allergy outranks a generic possible match.
    return "contraindicated" if text == "severe" else "major"


def issues_from(checks: dict[str, eng.CheckResult]) -> list[Issue]:
    """Every finding as a plain issue, most serious first (allergies and serious notes lead)."""
    out: list[Issue] = []
    for result in checks.values():
        for f in result.findings:
            who = " + ".join(f.medication_names)
            if f.matched_term:
                who = f"{who} · {f.matched_term}"
            out.append(
                Issue(
                    section=f.kind,
                    severity=f.severity,
                    title=who,
                    detail=f.description,
                    guidance=f.guidance,
                    medication_names=list(f.medication_names),
                    source=f.source,
                )
            )
        for a in result.allergy_findings:
            sev = f" ({a.allergy_severity})" if a.allergy_severity else ""
            out.append(
                Issue(
                    section="allergy",
                    severity=_allergy_severity(a.allergy_severity),
                    title=a.medication_name,
                    detail=(
                        f"Your recorded allergy “{a.allergy_text}”{sev} may match "
                        f"{a.ingredient_name} ({eng_basis(a.basis)})."
                    ),
                    guidance=eng.REVIEW_NOTE,
                    medication_names=[a.medication_name],
                    source=a.source,
                )
            )
        for d in result.duplicates:
            out.append(
                Issue(
                    section="duplicate",
                    severity="moderate",
                    title=" + ".join(d.medication_names),
                    detail=f"More than one of these contains {d.ingredient_name}.",
                    guidance=eng.REVIEW_NOTE,
                    medication_names=list(d.medication_names),
                    source=None,
                )
            )
    out.sort(key=lambda i: (-eng.SEVERITY_RANK[i.severity], i.section, i.title))
    return _dedupe(out)


def eng_basis(basis: str) -> str:
    return {
        "ingredient_name": "matches the ingredient name",
        "curated_term": "matches a term linked to this ingredient",
        "drug_class": "matches the medicine's drug class",
    }.get(basis, basis)


def _dedupe(issues: list[Issue]) -> list[Issue]:
    """Drop exact repeats only. Rules that disagree on severity or come from different sources
    stay separate: they are never merged (see engine.py)."""
    seen: set[tuple] = set()
    out = []
    for i in issues:
        key = (i.section, i.title, i.detail, i.severity, i.source)
        if key not in seen:
            seen.add(key)
            out.append(i)
    return out


def counts(issues: list[Issue]) -> dict[str, int]:
    serious = sum(1 for i in issues if i.severity in SERIOUS)
    return {"needs_attention": serious, "review": len(issues) - serious}


def sort_effects(effects: list[Effect]) -> list[Effect]:
    """Serious first, then most frequently reported, then alphabetical."""
    return sorted(
        effects,
        key=lambda e: (
            -SERIOUSNESS_RANK[e.seriousness],
            -FREQUENCY_RANK[e.frequency],
            e.effect.casefold(),
        ),
    )


def recompute_candidate_outcome(
    result: eng.CheckResult,
    *,
    candidate_mapped: bool,
    others_checked: int,
    others_unmapped: int,
) -> None:
    """Outcome for a drug-drug check narrowed to pairs that include one candidate medicine.

    The engine's own outcome describes the whole list; here only the candidate's pairs count.
    """
    if result.findings:
        result.outcome = eng.FINDINGS
    elif not candidate_mapped or others_checked == 0 or others_unmapped:
        result.outcome = eng.INSUFFICIENT
    else:
        result.outcome = eng.NO_MATCH
    result.notes = []
    eng.finish_notes(result)
    if candidate_mapped and others_checked == 0 and not others_unmapped:
        result.notes.append("You have no other active medicines on your list to compare with.")
