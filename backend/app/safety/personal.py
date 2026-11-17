"""Personalised safety endpoints.

* ``POST /safety/overview``                         everything about the patient's own list
* ``POST /safety/medicines/{id}/personal-check``    one searched medicine against that patient
* ``POST /safety/explain``                          plain-language explanation of either

The rules engine decides what is flagged. The explain endpoint only rewrites those findings in
plain words, and it follows the assistant's safeguards: AI use needs the patient's consent, the
model sees only numbered evidence, and its draft is validated (citations, invented numbers,
treatment advice) before it is shown. Without consent, without a configured model, or when a
draft is rejected, the patient gets a deterministic summary of the same findings instead.
"""

import uuid
from dataclasses import dataclass, field

from fastapi import APIRouter, Request
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, DbDep
from app.assistant import evidence as ev
from app.assistant import policy, retrieval
from app.assistant.models import ChatContextAccessLog
from app.assistant.prompts import SYSTEM_PROMPT, build_user_prompt
from app.assistant.provider import LLMUnavailable
from app.assistant.validate import validate_answer
from app.audit.service import record
from app.core.ratelimit import enforce
from app.medications.models import Medicine
from app.safety import assessment as asm
from app.safety import engine as eng
from app.safety import service as svc
from app.safety.schemas import (
    CheckOut,
    EffectOut,
    ExplainEvidence,
    ExplainIn,
    ExplainOut,
    FoodCheckIn,
    IssueCounts,
    IssueOut,
    MedicineBrief,
    MedicineEffectsOut,
    OverviewOut,
    PersonalCheckIn,
    PersonalCheckOut,
    PersonalContextOut,
)

router = APIRouter(tags=["safety"])

CANDIDATE = "candidate"
MAX_EFFECTS_PER_MEDICINE = 10
MAX_EVIDENCE_ISSUES = 12
MAX_EVIDENCE_EFFECTS = 8

EXPLAIN_QUESTION = (
    "Explain these medicine safety results for me in plain words: what stands out most, and "
    "what I could ask my pharmacist."
)
CONSENT_TEXT = (
    "To have an AI model explain this, allow it in Settings under Privacy. Nothing was sent "
    "anywhere. Here is a plain summary of the same findings instead."
)
FALLBACK_TEXT = (
    "I couldn't produce a written explanation I can stand behind, so here is a plain summary of "
    "the same findings."
)
PLAIN_TEXT = "No AI model wrote this. It is a plain summary of the findings."


# --------------------------------------------------------------------------------- results
@dataclass
class Assessment:
    status: str
    issues: list[asm.Issue]
    checks: dict[str, eng.CheckResult]
    effects: list[asm.Effect]
    context: PersonalContextOut
    notes: list[str] = field(default_factory=list)
    watch_for: list[MedicineEffectsOut] = field(default_factory=list)
    medicine: Medicine | None = None
    ingredient_names: list[str] = field(default_factory=list)
    already_taking: bool = False


def _terms(foods: list[str] | None) -> list[eng.PatientTerm] | None:
    return None if foods is None else [eng.PatientTerm(str(i), f) for i, f in enumerate(foods)]


def _coverage_notes(conditions: int, allergies: int) -> list[str]:
    """What the patient has not told us, so a quiet result is not read as a clearance."""
    notes = []
    if not conditions:
        notes.append(
            "No active health conditions are recorded, so condition checks could not run. "
            "Add them in My Health."
        )
    if not allergies:
        notes.append(
            "No allergies are recorded. That means unknown, not that you have none. "
            "Add them in My Health."
        )
    return notes


def assess_overview(db: Session, user, body: FoodCheckIn) -> Assessment:
    meds, ings = svc.context(db, user, body.medication_ids)
    ids = svc.ingredient_uuids(meds)
    rules = svc.load_rules(db, None, ids)
    conditions = svc.patient_conditions(db, user)
    allergies = svc.patient_allergies(db, user)
    foods_given = bool(body.foods)

    checks = {
        "drug_drug": eng.check_drug_drug(meds, rules, ings),
        "drug_condition": eng.check_by_term(meds, rules, ings, "drug_condition", conditions),
        "drug_food": eng.check_by_term(meds, rules, ings, "drug_food", _terms(body.foods)),
        "allergy": eng.check_allergies(meds, ings, allergies),
    }
    checks["drug_condition"].notes.append(
        "Only conditions marked active in your health profile are checked."
    )
    # Food notes listed without any foods typed are general information, not something found
    # about this patient, so they only count towards the status when foods were entered.
    counted = {k: v for k, v in checks.items() if k != "drug_food" or foods_given}
    issues = asm.issues_from(counted)

    effects = asm.sort_effects(svc.load_effects(db, ids))
    watch = []
    for m in meds:
        mine = [e for e in effects if e.ingredient_id in set(m.ingredient_ids)]
        if mine:
            watch.append(
                MedicineEffectsOut(
                    medication_id=m.id,
                    medication_name=m.name,
                    effects=[EffectOut.model_validate(e) for e in mine[:MAX_EFFECTS_PER_MEDICINE]],
                )
            )
    return Assessment(
        status=asm.status_for(list(counted.values())),
        issues=issues,
        checks=checks,
        effects=effects,
        context=PersonalContextOut(
            medications=len(meds),
            conditions=len(conditions),
            allergies=len(allergies),
            foods=len(body.foods) if body.foods is not None else None,
        ),
        notes=_coverage_notes(len(conditions), len(allergies)),
        watch_for=watch,
    )


def assess_medicine(db: Session, user, medicine: Medicine, foods: list[str] | None) -> Assessment:
    own = svc.medicine_ingredient_ids(db, medicine.id)
    cand = eng.PatientMed(CANDIDATE, medicine.name, tuple(sorted(str(i) for i in own)))
    mine = svc.patient_meds(db, user, None)
    # A medicine the patient already takes is not compared with itself; partial overlaps
    # (for example a combination product) are still reported as duplicates.
    same = [
        m for m in mine if cand.ingredient_ids and set(m.ingredient_ids) == set(cand.ingredient_ids)
    ]
    others = [m for m in mine if m not in same]

    ids = own | svc.ingredient_uuids(others)
    ings = svc.load_ingredients(db, ids)
    rules = svc.load_rules(db, None, ids)
    conditions = svc.patient_conditions(db, user)
    allergies = svc.patient_allergies(db, user)
    foods_given = bool(foods)

    dd = eng.check_drug_drug([*others, cand], rules, ings)
    dd.findings = [f for f in dd.findings if CANDIDATE in f.medication_ids]
    dd.duplicates = [d for d in dd.duplicates if CANDIDATE in d.medication_ids]
    asm.recompute_candidate_outcome(
        dd,
        candidate_mapped=bool(own),
        others_checked=sum(1 for m in others if m.ingredient_ids),
        others_unmapped=sum(1 for m in others if not m.ingredient_ids),
    )
    cond = eng.check_by_term([cand], rules, ings, "drug_condition", conditions)
    cond.notes.append("Only conditions marked active in your health profile are checked.")
    checks = {
        "drug_drug": dd,
        "drug_condition": cond,
        "drug_food": eng.check_by_term([cand], rules, ings, "drug_food", _terms(foods)),
        "allergy": eng.check_allergies([cand], ings, allergies),
    }
    counted = {k: v for k, v in checks.items() if k != "drug_food" or foods_given}
    effects = asm.sort_effects(svc.load_effects(db, own))
    names = sorted(ings[str(i)].name for i in own if str(i) in ings)
    return Assessment(
        status=asm.status_for(list(counted.values())),
        issues=asm.issues_from(counted),
        checks=checks,
        effects=effects,
        context=PersonalContextOut(
            medications=len(others),
            conditions=len(conditions),
            allergies=len(allergies),
            foods=len(foods) if foods is not None else None,
        ),
        notes=_coverage_notes(len(conditions), len(allergies))
        + (
            []
            if own
            else [
                "No active ingredients are recorded for this medicine, so it could not be checked."
            ]
        ),
        medicine=medicine,
        ingredient_names=names,
        already_taking=bool(same),
    )


def _issue_out(i: asm.Issue) -> IssueOut:
    return IssueOut.model_validate(i)


def _log(db: Session, request: Request, user, action: str, a: Assessment) -> None:
    # Counts and the status only: never medicine names, conditions or allergies.
    record(
        db,
        action,
        request,
        actor_user_id=user.id,
        resource_type="safety_check",
        metadata={
            "status": a.status,
            "issues": len(a.issues),
            "medications": a.context.medications,
        },
    )
    db.commit()


def _medicine_or_404(db: Session, medicine_id: uuid.UUID) -> Medicine:
    medicine = db.get(Medicine, medicine_id)
    if medicine is None:
        raise svc.not_found()
    return medicine


# ------------------------------------------------------------------------------- endpoints
@router.post("/safety/overview", response_model=OverviewOut)
def overview(body: FoodCheckIn, request: Request, user: CurrentUser, db: DbDep):
    a = assess_overview(db, user, body)
    _log(db, request, user, "safety.overview", a)
    return OverviewOut(
        status=a.status,
        counts=IssueCounts(**asm.counts(a.issues)),
        issues=[_issue_out(i) for i in a.issues],
        checks={k: CheckOut.model_validate(v) for k, v in a.checks.items()},
        watch_for=a.watch_for,
        context=a.context,
        notes=a.notes,
    )


@router.post("/safety/medicines/{medicine_id}/personal-check", response_model=PersonalCheckOut)
def personal_check(
    medicine_id: uuid.UUID, body: PersonalCheckIn, request: Request, user: CurrentUser, db: DbDep
):
    """One medicine from the catalogue checked against this patient's list, conditions and
    allergies. The medicine is not added to the patient's list."""
    medicine = _medicine_or_404(db, medicine_id)
    a = assess_medicine(db, user, medicine, body.foods)
    _log(db, request, user, "safety.personal_check", a)
    return PersonalCheckOut(
        medicine=MedicineBrief(
            id=medicine.id,
            name=medicine.name,
            form=medicine.form,
            strength_text=medicine.strength_text,
            ingredients=a.ingredient_names,
        ),
        already_taking=a.already_taking,
        status=a.status,
        counts=IssueCounts(**asm.counts(a.issues)),
        issues=[_issue_out(i) for i in a.issues],
        checks={k: CheckOut.model_validate(v) for k, v in a.checks.items()},
        effects=[EffectOut.model_validate(e) for e in a.effects],
        context=a.context,
        notes=a.notes,
    )


# --------------------------------------------------------------------------------- explain
def _source_line(s: eng.Source | None) -> str:
    if s is None:
        return ""
    return f" Source: {s.name}, version {s.version}, reviewed {s.reviewed_at.isoformat()}."


_EVIDENCE_TYPE = {
    "drug_drug": "medication",
    "duplicate": "medication",
    "drug_condition": "condition",
    "allergy": "allergy",
    "drug_food": "reference",
}


def build_evidence(a: Assessment) -> list[ev.EvidenceItem]:
    items: list[ev.EvidenceItem] = []

    def add(kind: str, label: str, text: str) -> None:
        items.append(
            ev.EvidenceItem(
                ref=f"E{len(items) + 1}",
                source_type=kind,
                source_record_id=None,
                label=label,
                text=text,
            )
        )

    for i in a.issues[:MAX_EVIDENCE_ISSUES]:
        guidance = f" {i.guidance}" if i.guidance else ""
        add(
            _EVIDENCE_TYPE[i.section],
            i.title,
            f"{asm.SECTION_LABELS[i.section]} note, severity {i.severity}: {i.title}. "
            f"{i.detail}{guidance}{_source_line(i.source)}",
        )
    for e in a.effects[:MAX_EVIDENCE_EFFECTS]:
        extra = f" {e.when_to_get_help}" if e.when_to_get_help else ""
        add(
            "reference",
            e.ingredient_name,
            f"Possible effect of {e.ingredient_name}: {e.effect}. Reported "
            f"{e.frequency.replace('_', ' ')}, {e.seriousness}.{extra}{_source_line(e.source)}",
        )
    return items


_HEADLINES = {
    asm.NEEDS_ATTENTION: "Some of this needs attention.",
    asm.REVIEW: "There are notes worth reviewing.",
    asm.NO_MATCH: "Nothing in this limited dataset matches your details. That is not the same as "
    "being cleared.",
    asm.INSUFFICIENT: "There is not enough information to check yet.",
}


def plain_summary(a: Assessment) -> str:
    """Deterministic text built only from the findings. No model is involved."""
    lines = [_HEADLINES[a.status]]
    for i in a.issues[:MAX_EVIDENCE_ISSUES]:
        lines.append(f"• {asm.SECTION_LABELS[i.section]} · {i.title}: {i.detail}")
    if not a.issues and a.notes:
        lines.append(a.notes[0])
    lines.append(eng.REVIEW_NOTE)
    return "\n".join(lines)


def _evidence_out(items: list[ev.EvidenceItem]) -> list[ExplainEvidence]:
    return [ExplainEvidence(ref=i.ref, text=i.text) for i in items]


@router.post("/safety/explain", response_model=ExplainOut)
def explain(body: ExplainIn, request: Request, user: CurrentUser, db: DbDep):
    settings = request.app.state.settings
    enforce(request, "safety_explain", str(user.id), settings.assistant_requests_per_minute, 60)

    if body.medicine_id:
        a = assess_medicine(db, user, _medicine_or_404(db, body.medicine_id), body.foods)
    else:
        a = assess_overview(db, user, FoodCheckIn(foods=body.foods))
    items = build_evidence(a)
    bundle = ev.Bundle(items=items, categories=["safety"])
    summary = plain_summary(a)

    def finish(mode: str, text: str, extra: dict | None = None) -> ExplainOut:
        record(
            db,
            "safety.explain",
            request,
            actor_user_id=user.id,
            resource_type="safety_check",
            metadata={"mode": mode, "status": a.status, "evidence": len(items), **(extra or {})},
        )
        db.commit()
        return ExplainOut(
            mode=mode,  # type: ignore[arg-type]
            text=text,
            evidence=_evidence_out(items),
            status=a.status,  # type: ignore[arg-type]
            disclaimer=policy.FOOTER,
        )

    if not items:
        return finish("evidence_only", summary)
    if not retrieval.ai_consent_granted(db, user):
        return finish("consent_required", f"{CONSENT_TEXT}\n\n{summary}")
    llm = request.app.state.llm
    if not llm.configured:
        return finish("evidence_only", f"{PLAIN_TEXT}\n\n{summary}")

    contacted: list[str] = []
    try:
        result = llm.complete(
            system=SYSTEM_PROMPT,
            user=build_user_prompt(bundle, EXPLAIN_QUESTION, body.language),
            max_tokens=settings.llm_max_output_tokens,
        )
    except LLMUnavailable as exc:
        contacted = list(exc.attempted)
        _disclose(db, user, a, items, contacted or [llm.name])
        return finish("fallback", f"{FALLBACK_TEXT}\n\n{summary}", {"providers": contacted})

    contacted = list(result.attempted) or [result.provider]
    _disclose(db, user, a, items, contacted)
    checked = validate_answer(result.text, bundle, EXPLAIN_QUESTION)
    if checked.ok:
        return finish("ai", result.text.strip(), {"providers": contacted})
    return finish(
        "fallback",
        f"{FALLBACK_TEXT}\n\n{summary}",
        {"providers": contacted, "rejected": list(checked.reasons)},
    )


def _disclose(db: Session, user, a: Assessment, items, providers: list[str]) -> None:
    """Same disclosure log the assistant writes: which vendors were sent this evidence."""
    db.add(
        ChatContextAccessLog(
            patient_user_id=user.id,
            purpose="safety_explain",
            context={"scope": "medicine" if a.medicine else "overview", "items": len(items)},
            sources=[],
            provider=",".join(providers)[:128],
        )
    )
