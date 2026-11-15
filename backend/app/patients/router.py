import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Request
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, DbDep
from app.audit.service import record
from app.core.errors import AppError
from app.core.pagination import Page, PageDep
from app.patients import service as svc
from app.patients.models import (
    EmergencyContact,
    PatientAllergy,
    PatientCondition,
    PatientProfile,
)
from app.patients.schemas import (
    AllergyIn,
    AllergyOut,
    AllergyPatch,
    ConditionIn,
    ConditionOut,
    ConditionPatch,
    ConsentIn,
    ConsentOut,
    ConsentType,
    ContactIn,
    ContactOut,
    ContactPatch,
    ProfileIn,
    ProfileOut,
)

router = APIRouter(tags=["patient"])

MAX_CONTACTS = 10
NOT_FOUND = AppError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.")


def _owned(db: Session, model, resource_id: uuid.UUID, user):
    """Owner-scoped lookup: a valid UUID belonging to someone else is indistinguishable
    from one that does not exist (no IDOR, no existence oracle)."""
    row = db.scalar(select(model).where(model.id == resource_id, model.patient_user_id == user.id))
    if row is None:
        raise AppError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.")
    return row


def _page(db: Session, model, user, params, *filters, order):
    base = select(model).where(model.patient_user_id == user.id, *filters)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    items = db.scalars(base.order_by(order).limit(params.limit).offset(params.offset)).all()
    return {"items": items, "total": total, "limit": params.limit, "offset": params.offset}


# ----------------------------------------------------------------------- profile
def _profile_out(db: Session, user) -> ProfileOut:
    p = db.scalar(select(PatientProfile).where(PatientProfile.user_id == user.id))
    if p is None:  # defensive: every user gets a profile at creation
        raise AppError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.")
    has_contact = (
        db.scalar(
            select(func.count())
            .select_from(EmergencyContact)
            .where(EmergencyContact.patient_user_id == user.id)
        )
        or 0
    ) > 0
    return ProfileOut(
        display_name=p.display_name,
        date_of_birth=p.date_of_birth,
        preferred_language=p.preferred_language,
        timezone=p.timezone,
        height_cm=float(p.height_cm) if p.height_cm is not None else None,
        weight_kg=float(p.weight_kg) if p.weight_kg is not None else None,
        blood_group=p.blood_group,
        blood_group_verification_status=p.blood_group_verification_status,
        accessibility_preferences=p.accessibility_preferences or {},
        onboarding_completed=svc.onboarding_completed(db, user.id),
        completeness=svc.completeness(p, has_contact),
    )


@router.get("/profile", response_model=ProfileOut)
def get_profile(user: CurrentUser, db: DbDep):
    return _profile_out(db, user)


@router.put("/profile", response_model=ProfileOut)
def update_profile(body: ProfileIn, request: Request, user: CurrentUser, db: DbDep):
    p = db.scalar(select(PatientProfile).where(PatientProfile.user_id == user.id))
    if p is None:
        raise NOT_FOUND
    if body.blood_group != p.blood_group:
        # A self-entered blood group is never "confirmed"; only a future clinician/import
        # workflow may raise this status.
        p.blood_group_verification_status = "patient_reported" if body.blood_group else "unverified"
    p.blood_group = body.blood_group
    p.display_name = body.display_name
    p.date_of_birth = body.date_of_birth
    p.preferred_language = body.preferred_language
    p.timezone = body.timezone
    p.height_cm = body.height_cm
    p.weight_kg = body.weight_kg
    p.accessibility_preferences = body.accessibility_preferences.model_dump()
    record(
        db,
        "profile.update",
        request,
        actor_user_id=user.id,
        resource_type="patient_profile",
        resource_id=p.id,
    )
    db.commit()
    return _profile_out(db, user)


# -------------------------------------------------------------------- conditions
@router.get("/conditions", response_model=Page[ConditionOut])
def list_conditions(
    user: CurrentUser,
    db: DbDep,
    params: PageDep,
    include_archived: Annotated[bool, Query()] = False,
):
    filters = [] if include_archived else [PatientCondition.status != "entered_in_error"]
    return _page(
        db, PatientCondition, user, params, *filters, order=PatientCondition.created_at.desc()
    )


@router.post("/conditions", response_model=ConditionOut, status_code=201)
def create_condition(body: ConditionIn, request: Request, user: CurrentUser, db: DbDep):
    row = PatientCondition(
        patient_user_id=user.id, verification_status="patient_reported", **body.model_dump()
    )
    db.add(row)
    db.flush()
    record(
        db,
        "condition.create",
        request,
        actor_user_id=user.id,
        resource_type="condition",
        resource_id=row.id,
    )
    db.commit()
    return row


@router.patch("/conditions/{condition_id}", response_model=ConditionOut)
def update_condition(
    condition_id: uuid.UUID, body: ConditionPatch, request: Request, user: CurrentUser, db: DbDep
):
    row = _owned(db, PatientCondition, condition_id, user)
    data = body.model_dump(exclude_unset=True)
    for required in ("display_name", "status"):
        if required in data and data[required] is None:
            raise AppError(422, "VALIDATION_ERROR", f"{required} cannot be empty.")
    if "display_name" in data and data["display_name"] != row.display_name:
        row.verification_status = "patient_reported"  # edited content is no longer confirmed
    for key, value in data.items():
        setattr(row, key, value)
    if row.onset_date and row.resolved_date and row.resolved_date < row.onset_date:
        raise AppError(422, "VALIDATION_ERROR", "Resolved date cannot be before onset date.")
    record(
        db,
        "condition.update",
        request,
        actor_user_id=user.id,
        resource_type="condition",
        resource_id=row.id,
    )
    db.commit()
    return row


# ---------------------------------------------------------------------- allergies
@router.get("/allergies", response_model=Page[AllergyOut])
def list_allergies(
    user: CurrentUser,
    db: DbDep,
    params: PageDep,
    include_archived: Annotated[bool, Query()] = False,
):
    filters = [] if include_archived else [PatientAllergy.status == "active"]
    return _page(db, PatientAllergy, user, params, *filters, order=PatientAllergy.created_at.desc())


@router.post("/allergies", response_model=AllergyOut, status_code=201)
def create_allergy(body: AllergyIn, request: Request, user: CurrentUser, db: DbDep):
    row = PatientAllergy(
        patient_user_id=user.id,
        verification_status="patient_reported",
        source="patient",
        **body.model_dump(),
    )
    db.add(row)
    db.flush()
    record(
        db,
        "allergy.create",
        request,
        actor_user_id=user.id,
        resource_type="allergy",
        resource_id=row.id,
    )
    db.commit()
    return row


@router.patch("/allergies/{allergy_id}", response_model=AllergyOut)
def update_allergy(
    allergy_id: uuid.UUID, body: AllergyPatch, request: Request, user: CurrentUser, db: DbDep
):
    row = _owned(db, PatientAllergy, allergy_id, user)
    data = body.model_dump(exclude_unset=True)
    for required in ("substance", "status"):
        if required in data and data[required] is None:
            raise AppError(422, "VALIDATION_ERROR", f"{required} cannot be empty.")
    if "substance" in data and data["substance"] != row.substance:
        row.verification_status = "patient_reported"
    for key, value in data.items():
        setattr(row, key, value)
    record(
        db,
        "allergy.update",
        request,
        actor_user_id=user.id,
        resource_type="allergy",
        resource_id=row.id,
    )
    db.commit()
    return row


# ------------------------------------------------------------- emergency contacts
@router.get("/emergency/contacts", response_model=Page[ContactOut])
def list_contacts(user: CurrentUser, db: DbDep, params: PageDep):
    return _page(db, EmergencyContact, user, params, order=EmergencyContact.created_at)


def _make_only_primary(db: Session, user, keep_id) -> None:
    db.execute(
        update(EmergencyContact)
        .where(EmergencyContact.patient_user_id == user.id, EmergencyContact.id != keep_id)
        .values(is_primary=False)
    )


@router.post("/emergency/contacts", response_model=ContactOut, status_code=201)
def create_contact(body: ContactIn, request: Request, user: CurrentUser, db: DbDep):
    count = db.scalar(
        select(func.count())
        .select_from(EmergencyContact)
        .where(EmergencyContact.patient_user_id == user.id)
    )
    if (count or 0) >= MAX_CONTACTS:
        raise AppError(
            409, "LIMIT_REACHED", f"You can save up to {MAX_CONTACTS} emergency contacts."
        )
    row = EmergencyContact(patient_user_id=user.id, **body.model_dump())
    db.add(row)
    db.flush()
    if row.is_primary:
        _make_only_primary(db, user, row.id)
    record(
        db,
        "emergency_contact.create",
        request,
        actor_user_id=user.id,
        resource_type="emergency_contact",
        resource_id=row.id,
    )
    db.commit()
    return row


@router.patch("/emergency/contacts/{contact_id}", response_model=ContactOut)
def update_contact(
    contact_id: uuid.UUID, body: ContactPatch, request: Request, user: CurrentUser, db: DbDep
):
    row = _owned(db, EmergencyContact, contact_id, user)
    data = body.model_dump(exclude_unset=True)
    for required in ("name", "phone_e164", "is_primary"):
        if required in data and data[required] is None:
            raise AppError(422, "VALIDATION_ERROR", f"{required} cannot be empty.")
    for key, value in data.items():
        setattr(row, key, value)
    if data.get("is_primary"):
        _make_only_primary(db, user, row.id)
    record(
        db,
        "emergency_contact.update",
        request,
        actor_user_id=user.id,
        resource_type="emergency_contact",
        resource_id=row.id,
    )
    db.commit()
    return row


@router.delete("/emergency/contacts/{contact_id}", status_code=204)
def delete_contact(contact_id: uuid.UUID, request: Request, user: CurrentUser, db: DbDep):
    row = _owned(db, EmergencyContact, contact_id, user)
    record(
        db,
        "emergency_contact.delete",
        request,
        actor_user_id=user.id,
        resource_type="emergency_contact",
        resource_id=row.id,
    )
    db.delete(row)
    db.commit()


# ---------------------------------------------------------------------- consents
@router.get("/consents", response_model=list[ConsentOut])
def list_consents(user: CurrentUser, db: DbDep):
    return svc.current_consents(db, user.id)


@router.put("/consents/{consent_type}", response_model=list[ConsentOut])
def set_consent(
    consent_type: ConsentType, body: ConsentIn, request: Request, user: CurrentUser, db: DbDep
):
    svc.record_consent(db, user.id, consent_type, body.granted)
    record(
        db,
        "consent.granted" if body.granted else "consent.revoked",
        request,
        actor_user_id=user.id,
        resource_type="consent",
        resource_id=consent_type,
    )
    db.commit()
    return svc.current_consents(db, user.id)
