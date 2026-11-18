"""Patient-facing safety, adverse-event, alternatives and authenticity endpoints."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, DbDep
from app.audit.service import record
from app.core.errors import AppError
from app.core.pagination import Page, PageDep
from app.medications import service as med_svc
from app.medications.models import Medicine
from app.records.service import owned_record_or_404
from app.safety import assessment as asm
from app.safety import authenticity as auth
from app.safety import comparison as cmp
from app.safety import engine as eng
from app.safety import service as svc
from app.safety.models import AdverseEventReport, MedicineIngredient
from app.safety.schemas import (
    AdverseIn,
    AdverseOut,
    AlternativesOut,
    AuthenticityIn,
    AuthenticityOut,
    CandidateOut,
    CheckIn,
    CheckOut,
    EffectOut,
    FindingOut,
    FoodCheckIn,
    IngredientBrief,
    MedicineCard,
    WarningsOut,
)

router = APIRouter(tags=["safety"])

MAX_ADVERSE_REPORTS = 500


def _finish(db: Session, request: Request, user, kind: str, result: eng.CheckResult) -> CheckOut:
    # Counts only: never medicine names or conditions in the audit trail.
    record(
        db,
        "safety.check",
        request,
        actor_user_id=user.id,
        resource_type="safety_check",
        metadata={
            "kind": kind,
            "outcome": result.outcome,
            "medications": result.checked_medications,
        },
    )
    db.commit()
    return CheckOut.model_validate(result)


# ------------------------------------------------------------------------------- checks
@router.post("/safety/drug-drug/check", response_model=CheckOut)
def drug_drug(body: CheckIn, request: Request, user: CurrentUser, db: DbDep):
    meds, ings = svc.context(db, user, body.medication_ids)
    rules = svc.load_rules(db, "drug_drug", svc.ingredient_uuids(meds))
    return _finish(db, request, user, "drug_drug", eng.check_drug_drug(meds, rules, ings))


@router.post("/safety/drug-condition/check", response_model=CheckOut)
def drug_condition(body: CheckIn, request: Request, user: CurrentUser, db: DbDep):
    meds, ings = svc.context(db, user, body.medication_ids)
    rules = svc.load_rules(db, "drug_condition", svc.ingredient_uuids(meds))
    conditions = svc.patient_conditions(db, user)
    result = eng.check_by_term(meds, rules, ings, "drug_condition", conditions)
    result.notes.append("Only conditions marked active in your health profile are checked.")
    return _finish(db, request, user, "drug_condition", result)


@router.post("/safety/drug-food/check", response_model=CheckOut)
def drug_food(body: FoodCheckIn, request: Request, user: CurrentUser, db: DbDep):
    meds, ings = svc.context(db, user, body.medication_ids)
    rules = svc.load_rules(db, "drug_food", svc.ingredient_uuids(meds))
    terms = (
        None
        if body.foods is None
        else [eng.PatientTerm(str(i), f) for i, f in enumerate(body.foods)]
    )
    return _finish(
        db, request, user, "drug_food", eng.check_by_term(meds, rules, ings, "drug_food", terms)
    )


@router.post("/safety/allergy/check", response_model=CheckOut)
def allergy(body: CheckIn, request: Request, user: CurrentUser, db: DbDep):
    meds, ings = svc.context(db, user, body.medication_ids)
    result = eng.check_allergies(meds, ings, svc.patient_allergies(db, user))
    return _finish(db, request, user, "allergy", result)


@router.get("/safety/medicines/{medicine_id}/warnings", response_model=WarningsOut)
def medicine_warnings(medicine_id: uuid.UUID, user: CurrentUser, db: DbDep):
    """Reference notes for a catalogue medicine. No patient data is used."""
    medicine = db.get(Medicine, medicine_id)
    if medicine is None:
        raise svc.not_found()
    own = set(
        db.scalars(
            select(MedicineIngredient.ingredient_id).where(
                MedicineIngredient.medicine_id == medicine_id
            )
        )
    )
    rules = svc.load_rules(db, None, own)
    # Drug-drug rules store the pair in sorted-id order, so the other ingredient can be
    # either side of the rule; load every id the rules mention.
    names = svc.load_ingredients(
        db,
        own
        | {uuid.UUID(r.ingredient_id) for r in rules}
        | {uuid.UUID(r.counterpart_ingredient_id) for r in rules if r.counterpart_ingredient_id},
    )
    out: list[eng.Finding] = []
    for r in rules:
        mine = r.ingredient_id if uuid.UUID(r.ingredient_id) in own else r.counterpart_ingredient_id
        other = r.counterpart_ingredient_id if mine == r.ingredient_id else r.ingredient_id
        out.append(
            eng.Finding(
                rule_id=r.id,
                kind=r.kind,
                severity=r.severity,
                description=r.description,
                clinical_significance=r.clinical_significance,
                guidance=r.guidance,
                source=r.source,
                medication_ids=[],
                medication_names=[medicine.name],
                ingredient_names=[names[mine].name],
                matched_term=names[other].name
                if r.kind == "drug_drug" and other in names
                else r.counterpart_term,
            )
        )
    out.sort(key=lambda f: (-eng.SEVERITY_RANK[f.severity], f.description))
    notes = []
    if not own:
        notes.append(
            "Active ingredients are not recorded for this medicine, so nothing could be looked up."
        )
    elif not out:
        notes.append(eng.NO_MATCH_NOTE)
    return WarningsOut(
        medicine_id=medicine.id,
        medicine_name=medicine.name,
        ingredients=sorted(names[str(i)].name for i in own if str(i) in names),
        rules=[FindingOut.model_validate(f) for f in out],
        effects=[EffectOut.model_validate(e) for e in asm.sort_effects(svc.load_effects(db, own))],
        notes=notes,
    )


# ------------------------------------------------------------------------ alternatives
def _card(c: cmp.Composition, names: dict[str, eng.Ingredient], prices) -> MedicineCard:
    return MedicineCard(
        id=uuid.UUID(c.medicine_id),
        name=c.name,
        form=c.form,
        strength_text=c.strength_text,
        route=c.route,
        release_type=c.release_type,
        ingredients=[
            IngredientBrief(
                name=names[x.ingredient_id].name if x.ingredient_id in names else "Unknown",
                strength_value=x.strength_value,
                strength_unit=x.strength_unit,
            )
            for x in sorted(
                c.components,
                key=lambda x: names[x.ingredient_id].name if x.ingredient_id in names else "",
            )
        ],
        prices=prices.get(uuid.UUID(c.medicine_id), []),
    )


def build_alternatives(db: Session, medicine: Medicine) -> AlternativesOut:
    """Candidates with the same ingredients, strengths, form, route and release type, with
    sourced, dated prices where they exist. Also used by the AI generics finder."""
    source = svc.compositions(db, [medicine])[0]
    ing_ids = {uuid.UUID(c.ingredient_id) for c in source.components}
    pool = svc.compositions(db, svc.candidate_pool(db, ing_ids))
    result = cmp.find_candidates(source, pool)
    shown = {uuid.UUID(c.composition.medicine_id) for c in result.candidates} | {medicine.id}
    prices = svc.prices_for(db, shown)
    names = svc.load_ingredients(db, ing_ids)
    return AlternativesOut(
        subject=_card(source, names, prices),
        status=result.status,
        candidates=[
            CandidateOut(medicine=_card(c.composition, names, prices), differences=c.differences)
            for c in result.candidates
        ],
        missing=result.missing,
        excluded_incomplete=result.excluded_incomplete,
        notice=cmp.CANDIDATE_NOTE,
        price_notice=cmp.PRICE_NOTE,
    )


@router.get("/medicines/{medicine_id}/alternatives", response_model=AlternativesOut)
def alternatives(medicine_id: uuid.UUID, user: CurrentUser, db: DbDep):
    """Candidates with the same ingredients, strengths, form, route and release type, with
    sourced, dated prices where they exist. Candidates are not substitutes."""
    medicine = db.get(Medicine, medicine_id)
    if medicine is None:
        raise svc.not_found()
    return build_alternatives(db, medicine)


# ------------------------------------------------------------------------- authenticity
@router.post("/safety/authenticity/check", response_model=AuthenticityOut)
def authenticity(body: AuthenticityIn, request: Request, user: CurrentUser, db: DbDep):
    name = lot = None
    if body.supply_id:
        supply = med_svc.owned_supply(db, body.supply_id, user)
        med = med_svc.owned_medication(db, supply.medication_id, user)
        name, lot = med.display_name, supply.lot_number
    lot = body.lot_number or lot
    verifier = request.app.state.authenticity
    result = auth.checked(verifier.verify(barcode=body.barcode, lot_number=lot, medicine_name=name))
    record(
        db,
        "safety.authenticity_check",
        request,
        actor_user_id=user.id,
        resource_type="safety_check",
        metadata={"status": result.status},
    )
    db.commit()
    return AuthenticityOut(
        status=result.status,
        detail=result.detail,
        source=result.source,
        checked_at=datetime.now(UTC),
        note=auth.SCAN_NOTE,
    )


# ----------------------------------------------------------------------- adverse events
@router.post("/adverse-events", response_model=AdverseOut, status_code=201)
def create_adverse_event(body: AdverseIn, request: Request, user: CurrentUser, db: DbDep):
    count = db.scalar(
        select(func.count())
        .select_from(AdverseEventReport)
        .where(AdverseEventReport.patient_user_id == user.id)
    )
    if (count or 0) >= MAX_ADVERSE_REPORTS:
        raise AppError(409, "LIMIT_REACHED", f"Up to {MAX_ADVERSE_REPORTS} reports each.")
    name = body.medication_name
    if body.medication_id:
        name = med_svc.owned_medication(db, body.medication_id, user).display_name
    if body.record_id:
        owned_record_or_404(db, body.record_id, user)
    row = AdverseEventReport(
        patient_user_id=user.id,
        medication_id=body.medication_id,
        medication_name=name,
        reaction=body.reaction,
        onset_date=body.onset_date,
        severity=body.severity,
        outcome=body.outcome,
        notes=body.notes,
        record_id=body.record_id,
        status="submitted",
    )
    db.add(row)
    db.flush()
    record(
        db,
        "adverse_event.create",
        request,
        actor_user_id=user.id,
        resource_type="adverse_event_report",
        resource_id=row.id,
    )
    db.commit()
    return row


@router.get("/adverse-events", response_model=Page[AdverseOut])
def list_adverse_events(user: CurrentUser, db: DbDep, params: PageDep):
    base = select(AdverseEventReport).where(
        AdverseEventReport.patient_user_id == user.id, AdverseEventReport.status == "submitted"
    )
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.scalars(
        base.order_by(AdverseEventReport.created_at.desc())
        .limit(params.limit)
        .offset(params.offset)
    ).all()
    return {"items": rows, "total": total, "limit": params.limit, "offset": params.offset}


@router.delete("/adverse-events/{report_id}", status_code=204)
def remove_adverse_event(report_id: uuid.UUID, request: Request, user: CurrentUser, db: DbDep):
    """Soft removal (ADR-008): the report is kept and marked entered in error."""
    row = db.scalar(
        select(AdverseEventReport).where(
            AdverseEventReport.id == report_id, AdverseEventReport.patient_user_id == user.id
        )
    )
    if row is None:
        raise svc.not_found()
    row.status = "entered_in_error"
    record(
        db,
        "adverse_event.remove",
        request,
        actor_user_id=user.id,
        resource_type="adverse_event_report",
        resource_id=row.id,
    )
    db.commit()
    return Response(status_code=204)
