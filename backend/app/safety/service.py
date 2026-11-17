"""Database access for the safety checks. All patient-owned queries are scoped by user id."""

import uuid
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.medications.models import Medication, Medicine
from app.patients.models import PatientAllergy, PatientCondition
from app.safety import assessment as asm
from app.safety import comparison as cmp
from app.safety import engine as eng
from app.safety.models import (
    ActiveIngredient,
    IngredientEffect,
    MedicineIngredient,
    MedicinePrice,
    ReferenceSource,
    SafetyRule,
)
from app.safety.schemas import PriceOut

MAX_PRICES_PER_MEDICINE = 5


def not_found() -> AppError:
    return AppError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.")


# ------------------------------------------------------------------------ reference data
def load_ingredients(db: Session, ids: set[uuid.UUID] | None) -> dict[str, eng.Ingredient]:
    if ids is not None and not ids:
        return {}
    stmt = select(ActiveIngredient, ReferenceSource).join(
        ReferenceSource, ReferenceSource.id == ActiveIngredient.source_id
    )
    if ids is not None:
        stmt = stmt.where(ActiveIngredient.id.in_(ids))
    return {
        str(i.id): eng.Ingredient(
            str(i.id),
            i.name,
            i.drug_class,
            tuple(i.allergy_terms or ()),
            eng.Source(s.name, s.version, s.reviewed_at, s.jurisdiction),
        )
        for i, s in db.execute(stmt)
    }


def load_rules(db: Session, kind: str | None, ids: set[uuid.UUID]) -> list[eng.Rule]:
    """Active rules touching any of the ingredient ids (kind None = every kind)."""
    if not ids:
        return []
    stmt = (
        select(SafetyRule, ReferenceSource)
        .join(ReferenceSource, ReferenceSource.id == SafetyRule.source_id)
        .where(SafetyRule.status == "active")
        .where(
            or_(SafetyRule.ingredient_id.in_(ids), SafetyRule.counterpart_ingredient_id.in_(ids))
        )
    )
    if kind:
        stmt = stmt.where(SafetyRule.kind == kind)
    return [
        eng.Rule(
            str(r.id),
            r.kind,
            str(r.ingredient_id),
            str(r.counterpart_ingredient_id) if r.counterpart_ingredient_id else None,
            r.counterpart_term,
            r.severity,
            r.description,
            r.clinical_significance,
            r.guidance,
            eng.Source(s.name, r.source_version, r.reviewed_at, r.jurisdiction),
        )
        for r, s in db.execute(stmt)
    ]


def load_effects(db: Session, ids: set[uuid.UUID]) -> list[asm.Effect]:
    """Active adverse effects for any of the ingredient ids."""
    if not ids:
        return []
    stmt = (
        select(IngredientEffect, ActiveIngredient, ReferenceSource)
        .join(ActiveIngredient, ActiveIngredient.id == IngredientEffect.ingredient_id)
        .join(ReferenceSource, ReferenceSource.id == IngredientEffect.source_id)
        .where(IngredientEffect.status == "active", IngredientEffect.ingredient_id.in_(ids))
    )
    return [
        asm.Effect(
            str(e.id),
            str(e.ingredient_id),
            i.name,
            e.effect,
            e.frequency,
            e.seriousness,
            e.when_to_get_help,
            eng.Source(s.name, e.source_version, e.reviewed_at, e.jurisdiction),
        )
        for e, i, s in db.execute(stmt)
    ]


def medicine_ingredient_ids(db: Session, medicine_id: uuid.UUID) -> set[uuid.UUID]:
    return set(
        db.scalars(
            select(MedicineIngredient.ingredient_id).where(
                MedicineIngredient.medicine_id == medicine_id
            )
        )
    )


def ingredient_sets(db: Session, medicine_ids: set[uuid.UUID]) -> dict[uuid.UUID, frozenset]:
    if not medicine_ids:
        return {}
    out: dict[uuid.UUID, set] = {}
    for mid, iid in db.execute(
        select(MedicineIngredient.medicine_id, MedicineIngredient.ingredient_id).where(
            MedicineIngredient.medicine_id.in_(medicine_ids)
        )
    ):
        out.setdefault(mid, set()).add(iid)
    return {k: frozenset(v) for k, v in out.items()}


# ----------------------------------------------------------------------- patient context
def patient_meds(db: Session, user, ids: list[uuid.UUID] | None) -> list[eng.PatientMed]:
    """The patient's medicines mapped to ingredients. A medicine is mapped through its
    catalogue link, or, failing that, by an exact name match that every catalogue row of that
    name agrees on. Anything else stays unmapped (and the checks say so)."""
    base = select(Medication).where(Medication.patient_user_id == user.id)
    if ids:
        wanted = set(ids)
        rows = db.scalars(
            base.where(Medication.id.in_(wanted), Medication.status != "entered_in_error")
        ).all()
        if len(rows) != len(wanted):
            raise not_found()
    else:
        rows = db.scalars(
            base.where(Medication.status == "active").order_by(Medication.display_name)
        ).all()

    linked = ingredient_sets(db, {m.medicine_id for m in rows if m.medicine_id})
    need = [m for m in rows if not (m.medicine_id and linked.get(m.medicine_id))]
    by_name: dict[str, set[frozenset]] = {}
    if need:
        lowered = {m.display_name.lower() for m in need}
        catalogue = db.execute(
            select(Medicine.id, func.lower(Medicine.name)).where(
                func.lower(Medicine.name).in_(lowered)
            )
        ).all()
        sets = ingredient_sets(db, {c[0] for c in catalogue})
        for mid, lname in catalogue:
            if sets.get(mid):
                by_name.setdefault(lname, set()).add(sets[mid])

    meds = []
    for m in rows:
        found = linked.get(m.medicine_id) if m.medicine_id else None
        if not found:
            options = by_name.get(m.display_name.lower(), set())
            found = next(iter(options)) if len(options) == 1 else None
        meds.append(
            eng.PatientMed(
                str(m.id), m.display_name, tuple(sorted(str(i) for i in found)) if found else ()
            )
        )
    return meds


def context(db: Session, user, ids) -> tuple[list[eng.PatientMed], dict[str, eng.Ingredient]]:
    meds = patient_meds(db, user, ids)
    wanted = {uuid.UUID(i) for m in meds for i in m.ingredient_ids}
    return meds, load_ingredients(db, wanted)


def ingredient_uuids(meds: list[eng.PatientMed]) -> set[uuid.UUID]:
    return {uuid.UUID(i) for m in meds for i in m.ingredient_ids}


def patient_conditions(db: Session, user) -> list[eng.PatientTerm]:
    rows = db.scalars(
        select(PatientCondition).where(
            PatientCondition.patient_user_id == user.id, PatientCondition.status == "active"
        )
    ).all()
    return [eng.PatientTerm(str(c.id), c.display_name, c.condition_code) for c in rows]


def patient_allergies(db: Session, user) -> list[eng.PatientTerm]:
    rows = db.scalars(
        select(PatientAllergy).where(
            PatientAllergy.patient_user_id == user.id, PatientAllergy.status == "active"
        )
    ).all()
    return [eng.PatientTerm(str(a.id), a.substance, None, a.severity) for a in rows]


# ------------------------------------------------------------------ alternatives & prices
def compositions(db: Session, medicines: list[Medicine]) -> list[cmp.Composition]:
    ids = {m.id for m in medicines}
    parts: dict[uuid.UUID, list[cmp.Component]] = {}
    if ids:
        for row in db.scalars(
            select(MedicineIngredient).where(MedicineIngredient.medicine_id.in_(ids))
        ):
            value = Decimal(str(row.strength_value)) if row.strength_value is not None else None
            parts.setdefault(row.medicine_id, []).append(
                cmp.Component(str(row.ingredient_id), value, row.strength_unit)
            )
    return [
        cmp.Composition(
            str(m.id),
            m.name,
            m.form,
            m.strength_text,
            m.route,
            m.release_type,
            tuple(parts.get(m.id, [])),
        )
        for m in medicines
    ]


def candidate_pool(db: Session, ingredient_ids: set[uuid.UUID]) -> list[Medicine]:
    if not ingredient_ids:
        return []
    shared = select(MedicineIngredient.medicine_id).where(
        MedicineIngredient.ingredient_id.in_(ingredient_ids)
    )
    return list(db.scalars(select(Medicine).where(Medicine.id.in_(shared))))


def prices_for(db: Session, medicine_ids: set[uuid.UUID]) -> dict[uuid.UUID, list[PriceOut]]:
    """Latest observation per (source, currency, pack unit, jurisdiction), newest first."""
    out: dict[uuid.UUID, list[PriceOut]] = {}
    if not medicine_ids:
        return out
    rows = db.scalars(
        select(MedicinePrice)
        .where(MedicinePrice.medicine_id.in_(medicine_ids))
        .order_by(MedicinePrice.observed_at.desc())
    )
    seen: set[tuple] = set()
    for p in rows:
        key = (p.medicine_id, p.source_name, p.currency, p.pack_unit, p.jurisdiction)
        if key in seen or len(out.get(p.medicine_id, [])) >= MAX_PRICES_PER_MEDICINE:
            continue
        seen.add(key)
        age = cmp.age_days(p.observed_at)
        out.setdefault(p.medicine_id, []).append(
            PriceOut(
                source_name=p.source_name,
                price=Decimal(str(p.price)),
                currency=p.currency,
                pack_quantity=Decimal(str(p.pack_quantity)),
                pack_unit=p.pack_unit,
                unit_price=cmp.unit_price(Decimal(str(p.price)), Decimal(str(p.pack_quantity))),
                jurisdiction=p.jurisdiction,
                observed_at=p.observed_at,
                age_days=age,
                stale=age > cmp.STALE_AFTER_DAYS,
            )
        )
    return out
