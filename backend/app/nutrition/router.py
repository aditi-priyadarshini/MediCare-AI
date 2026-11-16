"""Diet preferences and educational meal plans (patient-owned).

Plans are built by a deterministic planner from a small curated collection (`planner.py`). Recorded
allergies are always applied and recorded conditions are always screened, so protection never
depends on the patient remembering to opt in. Audit entries hold counts and flag codes only.
"""

import uuid

from fastapi import APIRouter, Request, Response
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DbDep
from app.audit.service import record
from app.core.errors import AppError
from app.core.pagination import Page, PageDep
from app.medications.models import Medication
from app.nutrition import planner
from app.nutrition.catalogue import CATALOGUE_VERSION
from app.nutrition.models import DietPlan, DietPreference
from app.nutrition.schemas import (
    FlagOut,
    PlanIn,
    PlanOut,
    PlanSummary,
    PreferencesIn,
    PreferencesOut,
)
from app.patients.models import PatientAllergy, PatientCondition

router = APIRouter(prefix="/diet", tags=["diet"])

MAX_PLANS = 50
DEFAULTS = PreferencesIn(diet_type="no_restriction")


def _not_found() -> AppError:
    return AppError(404, "RESOURCE_NOT_FOUND", "That plan was not found.")


def _prefs(row: DietPreference | None) -> planner.Prefs:
    src = row or DEFAULTS
    return planner.Prefs(
        diet_type=src.diet_type,
        cuisine=src.cuisine,
        meals_per_day=src.meals_per_day,
        avoid_foods=tuple(src.avoid_foods),
        situations=tuple(src.situations),
    )


def _profile_facts(db, user) -> tuple[list[str], list[str], int]:
    conditions = db.scalars(
        select(PatientCondition.display_name).where(
            PatientCondition.patient_user_id == user.id, PatientCondition.status == "active"
        )
    ).all()
    allergies = db.scalars(
        select(PatientAllergy.substance).where(
            PatientAllergy.patient_user_id == user.id, PatientAllergy.status == "active"
        )
    ).all()
    medicines = (
        db.scalar(
            select(func.count())
            .select_from(Medication)
            .where(Medication.patient_user_id == user.id, Medication.status == "active")
        )
        or 0
    )
    return list(conditions), list(allergies), medicines


def _flags(flags: list[planner.Flag]) -> list[FlagOut]:
    return [FlagOut(code=f.code, severity=f.severity, message=f.message) for f in flags]


def _plan_out(plan: DietPlan) -> PlanOut:
    return PlanOut(
        id=plan.id,
        title=plan.title,
        created_at=plan.created_at,
        catalogue_version=plan.catalogue_version,
        constraints_used=plan.constraints_used,
        review_flags=plan.review_flags,
        days=plan.days,
        limitations=planner.limitations(),
        notice=planner.DIET_NOTICE,
    )


@router.get("/preferences", response_model=PreferencesOut)
def get_preferences(user: CurrentUser, db: DbDep):
    row = db.scalar(select(DietPreference).where(DietPreference.patient_user_id == user.id))
    conditions, _, medicines = _profile_facts(db, user)
    src = row or DEFAULTS
    return PreferencesOut(
        diet_type=src.diet_type,
        cuisine=src.cuisine,
        meals_per_day=src.meals_per_day,
        avoid_foods=list(src.avoid_foods),
        situations=list(src.situations),
        saved=row is not None,
        review_flags=_flags(planner.screen(_prefs(row), conditions, medicines)),
        notice=planner.DIET_NOTICE,
        updated_at=row.updated_at if row else None,
    )


@router.put("/preferences", response_model=PreferencesOut)
def put_preferences(body: PreferencesIn, request: Request, user: CurrentUser, db: DbDep):
    row = db.scalar(select(DietPreference).where(DietPreference.patient_user_id == user.id))
    if row is None:
        row = DietPreference(patient_user_id=user.id)
        db.add(row)
    row.diet_type = body.diet_type
    row.cuisine = body.cuisine
    row.meals_per_day = body.meals_per_day
    row.avoid_foods = body.avoid_foods
    row.situations = list(body.situations)
    record(
        db,
        "diet.preferences_update",
        request,
        actor_user_id=user.id,
        resource_type="diet_preferences",
    )
    db.commit()
    db.refresh(row)
    return get_preferences(user, db)


@router.get("/plans", response_model=Page[PlanSummary])
def list_plans(user: CurrentUser, db: DbDep, params: PageDep):
    total = db.scalar(
        select(func.count()).select_from(DietPlan).where(DietPlan.patient_user_id == user.id)
    )
    rows = db.scalars(
        select(DietPlan)
        .where(DietPlan.patient_user_id == user.id)
        .order_by(DietPlan.created_at.desc(), DietPlan.id)
        .limit(params.limit)
        .offset(params.offset)
    ).all()
    return {"items": rows, "total": total or 0, "limit": params.limit, "offset": params.offset}


@router.post("/plans", response_model=PlanOut, status_code=201)
def create_plan(body: PlanIn, request: Request, user: CurrentUser, db: DbDep):
    pref = db.scalar(select(DietPreference).where(DietPreference.patient_user_id == user.id))
    if pref is None:
        raise AppError(409, "PREFERENCES_REQUIRED", "Save your food preferences first.")
    count = db.scalar(
        select(func.count()).select_from(DietPlan).where(DietPlan.patient_user_id == user.id)
    )
    if (count or 0) >= MAX_PLANS:
        raise AppError(409, "PLAN_LIMIT", "Delete an older plan before creating another.")

    prefs = _prefs(pref)
    conditions, allergies, medicines = _profile_facts(db, user)
    screening = planner.screen(prefs, conditions, medicines)
    stop = planner.blocking(screening)
    if stop is not None:
        record(
            db,
            "diet.plan_declined",
            request,
            actor_user_id=user.id,
            resource_type="diet_plan",
            metadata={"flag": stop.code},
        )
        db.commit()
        raise AppError(409, "DIETITIAN_REVIEW_REQUIRED", stop.message)

    result = planner.build_plan(prefs, allergies)
    flags = [
        planner.Flag("general_education", "info", planner.DIET_NOTICE),
        *screening,
        *result.flags,
    ]
    plan = DietPlan(
        id=uuid.uuid4(),
        patient_user_id=user.id,
        title=body.title or "7-day meal ideas",
        constraints_used=result.constraints_used,
        review_flags=[f.__dict__ for f in flags],
        days=result.days,
        catalogue_version=CATALOGUE_VERSION,
    )
    db.add(plan)
    record(
        db,
        "diet.plan_create",
        request,
        actor_user_id=user.id,
        resource_type="diet_plan",
        resource_id=plan.id,
        metadata={"flags": [f.code for f in flags]},
    )
    db.commit()
    db.refresh(plan)
    return _plan_out(plan)


def _owned(db, user, plan_id: uuid.UUID) -> DietPlan:
    plan = db.get(DietPlan, plan_id)
    if plan is None or plan.patient_user_id != user.id:
        raise _not_found()
    return plan


@router.get("/plans/{plan_id}", response_model=PlanOut)
def get_plan(plan_id: uuid.UUID, user: CurrentUser, db: DbDep):
    return _plan_out(_owned(db, user, plan_id))


@router.delete("/plans/{plan_id}", status_code=204)
def delete_plan(plan_id: uuid.UUID, request: Request, user: CurrentUser, db: DbDep):
    plan = _owned(db, user, plan_id)
    db.delete(plan)
    record(
        db,
        "diet.plan_delete",
        request,
        actor_user_id=user.id,
        resource_type="diet_plan",
        resource_id=plan_id,
    )
    db.commit()
    return Response(status_code=204)
