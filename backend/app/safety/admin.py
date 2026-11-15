"""Admin curation of reference data. Every change is audited; rules are retired, never edited,
so earlier versions stay on record. Admins get no access to patient data here."""

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Query, Request, Response
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import AdminUser, DbDep
from app.audit.service import record
from app.core.errors import AppError
from app.core.pagination import Page, PageDep
from app.medications.models import Medicine
from app.safety import engine as eng
from app.safety.models import (
    ActiveIngredient,
    MedicineIngredient,
    MedicinePrice,
    ReferenceSource,
    SafetyRule,
)
from app.safety.schemas import (
    CompositionIn,
    IngredientIn,
    IngredientOut,
    PriceIn,
    RuleIn,
    RuleKind,
    RuleOut,
    SourceIn,
    SourceOut2,
)

router = APIRouter(prefix="/admin", tags=["admin"])


def _audit(db: Session, action: str, request: Request, admin, rtype: str, rid) -> None:
    record(db, action, request, actor_user_id=admin.id, resource_type=rtype, resource_id=rid)


def _missing(what: str) -> AppError:
    return AppError(422, "VALIDATION_ERROR", f"That {what} does not exist.")


def _commit_or_conflict(db: Session, message: str) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "ALREADY_EXISTS", message) from exc


# ---------------------------------------------------------------------------- sources
@router.get("/sources", response_model=Page[SourceOut2])
def list_sources(admin: AdminUser, db: DbDep, params: PageDep):
    total = db.scalar(select(func.count()).select_from(ReferenceSource)) or 0
    rows = db.scalars(
        select(ReferenceSource)
        .order_by(ReferenceSource.name, ReferenceSource.version)
        .limit(params.limit)
        .offset(params.offset)
    ).all()
    return {"items": rows, "total": total, "limit": params.limit, "offset": params.offset}


@router.post("/sources", response_model=SourceOut2, status_code=201)
def create_source(body: SourceIn, request: Request, admin: AdminUser, db: DbDep):
    row = ReferenceSource(**body.model_dump())
    db.add(row)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "ALREADY_EXISTS", "That source and version already exist.") from exc
    _audit(db, "admin.source_create", request, admin, "reference_source", row.id)
    db.commit()
    return row


# ------------------------------------------------------------------------- ingredients
@router.get("/ingredients", response_model=Page[IngredientOut])
def list_ingredients(admin: AdminUser, db: DbDep, params: PageDep):
    total = db.scalar(select(func.count()).select_from(ActiveIngredient)) or 0
    rows = db.scalars(
        select(ActiveIngredient)
        .order_by(ActiveIngredient.normalized_name)
        .limit(params.limit)
        .offset(params.offset)
    ).all()
    return {"items": rows, "total": total, "limit": params.limit, "offset": params.offset}


@router.post("/ingredients", response_model=IngredientOut, status_code=201)
def create_ingredient(body: IngredientIn, request: Request, admin: AdminUser, db: DbDep):
    if db.get(ReferenceSource, body.source_id) is None:
        raise _missing("source")
    row = ActiveIngredient(
        name=body.name,
        normalized_name=eng.normalize(body.name),
        drug_class=body.drug_class,
        allergy_terms=body.allergy_terms,
        source_id=body.source_id,
    )
    db.add(row)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "ALREADY_EXISTS", "That ingredient already exists.") from exc
    _audit(db, "admin.ingredient_create", request, admin, "active_ingredient", row.id)
    db.commit()
    return row


@router.put("/medicines/{medicine_id}/composition", status_code=204)
def set_composition(
    medicine_id: uuid.UUID, body: CompositionIn, request: Request, admin: AdminUser, db: DbDep
):
    """Replace a catalogue medicine's ingredients, route and release type in one step."""
    medicine = db.get(Medicine, medicine_id)
    if medicine is None:
        raise AppError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.")
    wanted = {c.ingredient_id for c in body.ingredients}
    found = set(db.scalars(select(ActiveIngredient.id).where(ActiveIngredient.id.in_(wanted))))
    if found != wanted:
        raise _missing("ingredient")
    db.execute(delete(MedicineIngredient).where(MedicineIngredient.medicine_id == medicine_id))
    for c in body.ingredients:
        db.add(
            MedicineIngredient(
                medicine_id=medicine_id,
                ingredient_id=c.ingredient_id,
                strength_value=c.strength_value,
                strength_unit=c.strength_unit,
            )
        )
    medicine.route, medicine.release_type = body.route, body.release_type
    _audit(db, "admin.composition_set", request, admin, "medicine", medicine_id)
    db.commit()
    return Response(status_code=204)


# ------------------------------------------------------------------------------ rules
@router.get("/safety-rules", response_model=Page[RuleOut])
def list_rules(
    admin: AdminUser,
    db: DbDep,
    params: PageDep,
    kind: Annotated[RuleKind | None, Query()] = None,
    status: Annotated[str, Query(pattern="^(active|retired|all)$")] = "active",
):
    base = select(SafetyRule)
    if kind:
        base = base.where(SafetyRule.kind == kind)
    if status != "all":
        base = base.where(SafetyRule.status == status)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.scalars(
        base.order_by(SafetyRule.created_at.desc()).limit(params.limit).offset(params.offset)
    ).all()
    return {"items": rows, "total": total, "limit": params.limit, "offset": params.offset}


@router.post("/safety-rules", response_model=RuleOut, status_code=201)
def create_rule(body: RuleIn, request: Request, admin: AdminUser, db: DbDep):
    wanted = {body.ingredient_id} | ({body.counterpart_ingredient_id} - {None})
    if (
        set(db.scalars(select(ActiveIngredient.id).where(ActiveIngredient.id.in_(wanted))))
        != wanted
    ):
        raise _missing("ingredient")
    if db.get(ReferenceSource, body.source_id) is None:
        raise _missing("source")
    data = body.model_dump()
    if body.kind == "drug_drug" and data["ingredient_id"] > data["counterpart_ingredient_id"]:
        # Canonical order: a pair is stored once, whichever way it was entered.
        a, b = data["counterpart_ingredient_id"], data["ingredient_id"]
        data["ingredient_id"], data["counterpart_ingredient_id"] = a, b
    if data["counterpart_term"]:
        data["counterpart_term"] = eng.normalize(data["counterpart_term"])
    row = SafetyRule(created_by_user_id=admin.id, status="active", **data)
    db.add(row)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(
            409, "ALREADY_EXISTS", "An active rule from that source and version already exists."
        ) from exc
    _audit(db, "admin.rule_create", request, admin, "safety_rule", row.id)
    db.commit()
    return row


@router.post("/safety-rules/{rule_id}/retire", response_model=RuleOut)
def retire_rule(rule_id: uuid.UUID, request: Request, admin: AdminUser, db: DbDep):
    row = db.get(SafetyRule, rule_id)
    if row is None:
        raise AppError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.")
    if row.status == "active":
        row.status, row.retired_at = "retired", datetime.now(UTC)
        _audit(db, "admin.rule_retire", request, admin, "safety_rule", row.id)
        db.commit()
    return row


# ------------------------------------------------------------------------------ prices
@router.post("/medicines/{medicine_id}/prices", status_code=201)
def add_price(medicine_id: uuid.UUID, body: PriceIn, request: Request, admin: AdminUser, db: DbDep):
    if db.get(Medicine, medicine_id) is None:
        raise AppError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.")
    row = MedicinePrice(medicine_id=medicine_id, created_by_user_id=admin.id, **body.model_dump())
    db.add(row)
    db.flush()
    _audit(db, "admin.price_create", request, admin, "medicine_price", row.id)
    db.commit()
    return {"id": row.id}
