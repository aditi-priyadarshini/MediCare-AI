"""Admin curation of the care directory. Every change is audited. Admins get no patient data here:
the provider-response endpoint sees an appointment id and a provider reference, nothing else."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Request, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.api.deps import AdminUser, DbDep
from app.audit.service import record
from app.core.errors import AppError
from app.core.pagination import Page, PageDep
from app.discovery import service as svc
from app.discovery.models import (
    Appointment,
    Doctor,
    DoctorCredential,
    Pharmacy,
    ProviderSource,
)
from app.discovery.providers import InventoryItem
from app.discovery.schemas import (
    AdminPlaceOut,
    CredentialIn,
    DoctorIn,
    InventoryFeedIn,
    InventoryFeedOut,
    PharmacyIn,
    ProviderResponseIn,
    ProviderSourceIn,
    ProviderSourceOut,
)

router = APIRouter(prefix="/admin", tags=["admin"])


def _bad(message: str) -> AppError:
    return AppError(422, "VALIDATION_ERROR", message)


def _source(db, source_id: uuid.UUID, kind: str) -> ProviderSource:
    src = db.get(ProviderSource, source_id)
    if src is None:
        raise _bad("That source does not exist.")
    if src.kind != kind:
        raise _bad(f"That source is not a {kind} source.")
    return src


def _audit(db, action: str, request: Request, admin, rtype: str, rid, **meta) -> None:
    record(
        db,
        action,
        request,
        actor_user_id=admin.id,
        resource_type=rtype,
        resource_id=rid,
        metadata=meta,
    )


# --------------------------------------------------------------------------- sources
@router.get("/provider-sources", response_model=Page[ProviderSourceOut])
def list_sources(admin: AdminUser, db: DbDep, params: PageDep):
    total = db.scalar(select(func.count()).select_from(ProviderSource)) or 0
    rows = db.scalars(
        select(ProviderSource)
        .order_by(ProviderSource.name, ProviderSource.retrieved_on.desc())
        .limit(params.limit)
        .offset(params.offset)
    ).all()
    return {"items": rows, "total": total, "limit": params.limit, "offset": params.offset}


@router.post("/provider-sources", response_model=ProviderSourceOut, status_code=201)
def create_source(body: ProviderSourceIn, request: Request, admin: AdminUser, db: DbDep):
    row = ProviderSource(**body.model_dump())
    db.add(row)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "ALREADY_EXISTS", "That source already exists for that date.") from exc
    _audit(db, "admin.provider_source_create", request, admin, "provider_source", row.id)
    db.commit()
    return row


# ------------------------------------------------------------------------- pharmacies
@router.post("/pharmacies", response_model=AdminPlaceOut, status_code=201)
def create_pharmacy(body: PharmacyIn, request: Request, admin: AdminUser, db: DbDep):
    _source(db, body.source_id, "directory")
    row = Pharmacy(**body.model_dump())
    db.add(row)
    db.flush()
    _audit(db, "admin.pharmacy_create", request, admin, "pharmacy", row.id)
    db.commit()
    return {"id": row.id}


@router.post("/pharmacies/{pharmacy_id}/retire", status_code=204)
def retire_pharmacy(pharmacy_id: uuid.UUID, request: Request, admin: AdminUser, db: DbDep):
    row = db.get(Pharmacy, pharmacy_id)
    if row is None:
        raise svc.not_found("pharmacy")
    row.status = "retired"
    _audit(db, "admin.pharmacy_retire", request, admin, "pharmacy", row.id)
    db.commit()
    return Response(status_code=204)


@router.post(
    "/pharmacies/{pharmacy_id}/inventory", response_model=InventoryFeedOut, status_code=201
)
def ingest_inventory(
    pharmacy_id: uuid.UUID, body: InventoryFeedIn, request: Request, admin: AdminUser, db: DbDep
):
    """The push side of the inventory contract: a feed (or an admin) reports stock, always naming
    the source and the time the SOURCE observed it. Rows are appended, never edited."""
    pharmacy = db.get(Pharmacy, pharmacy_id)
    if pharmacy is None:
        raise svc.not_found("pharmacy")
    source = _source(db, body.source_id, "inventory")
    accepted = svc.ingest_inventory(
        db,
        pharmacy,
        source,
        [
            InventoryItem(
                medicine_id=i.medicine_id,
                availability=i.availability,
                source_timestamp=i.source_timestamp,
                price_amount=i.price_amount,
                currency=i.currency,
                pack_size_text=i.pack_size_text,
            )
            for i in body.items
        ],
    )
    _audit(db, "admin.inventory_ingest", request, admin, "pharmacy", pharmacy.id, items=accepted)
    db.commit()
    return {"accepted": accepted}


# --------------------------------------------------------------------------- doctors
@router.post("/doctors", response_model=AdminPlaceOut, status_code=201)
def create_doctor(body: DoctorIn, request: Request, admin: AdminUser, db: DbDep):
    _source(db, body.source_id, "directory")
    row = Doctor(**body.model_dump())
    db.add(row)
    db.flush()
    _audit(db, "admin.doctor_create", request, admin, "doctor", row.id)
    db.commit()
    return {"id": row.id}


@router.post("/doctors/{doctor_id}/retire", status_code=204)
def retire_doctor(doctor_id: uuid.UUID, request: Request, admin: AdminUser, db: DbDep):
    row = db.get(Doctor, doctor_id)
    if row is None:
        raise svc.not_found("doctor")
    row.status = "retired"
    _audit(db, "admin.doctor_retire", request, admin, "doctor", row.id)
    db.commit()
    return Response(status_code=204)


@router.post("/doctors/{doctor_id}/credentials", response_model=AdminPlaceOut, status_code=201)
def add_credential(
    doctor_id: uuid.UUID, body: CredentialIn, request: Request, admin: AdminUser, db: DbDep
):
    if db.get(Doctor, doctor_id) is None:
        raise svc.not_found("doctor")
    if body.verification_source_id is not None:
        _source(db, body.verification_source_id, "credential")
    row = DoctorCredential(doctor_id=doctor_id, **body.model_dump())
    db.add(row)
    db.flush()
    # The registration number itself is never written to the audit trail.
    _audit(db, "admin.credential_add", request, admin, "doctor", doctor_id, status=body.status)
    db.commit()
    return {"id": row.id}


# ----------------------------------------------------------------------- appointments
@router.post("/appointments/{appointment_id}/provider-response", status_code=204)
def record_provider_response(
    appointment_id: uuid.UUID,
    body: ProviderResponseIn,
    request: Request,
    admin: AdminUser,
    db: DbDep,
):
    """Stand-in for a provider callback. It is the only way an appointment becomes `confirmed` or
    `declined`, and only for one that was actually sent and whose reference matches."""
    appt = db.get(Appointment, appointment_id)
    if appt is None:
        raise svc.not_found("appointment")
    if appt.mode != "provider" or appt.status != "sent":
        raise AppError(
            409, "NOT_AWAITING_RESPONSE", "That appointment is not awaiting a provider response."
        )
    if appt.provider_reference != body.provider_reference:
        raise _bad("The provider reference does not match.")
    appt.status = body.outcome
    appt.provider_responded_at = datetime.now(UTC)
    appt.provider_message = body.message
    _audit(
        db,
        "admin.appointment_provider_response",
        request,
        admin,
        "appointment",
        appt.id,
        outcome=body.outcome,
    )
    db.commit()
    return Response(status_code=204)
