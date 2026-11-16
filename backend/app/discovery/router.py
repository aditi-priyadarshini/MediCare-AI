"""Patient-facing pharmacy, doctor and appointment endpoints.

A patient's location is accepted only as query parameters on a search, used for that one request
and never stored or logged (request logs hold the route template, not the URL). Appointment
requests are honest about what happened to them: see `status_text`.
"""

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Query, Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentUser, DbDep
from app.audit.service import record
from app.core.errors import AppError
from app.core.pagination import Page, PageDep
from app.discovery import service as svc
from app.discovery.models import Appointment, Doctor, Pharmacy
from app.discovery.providers import AppointmentProvider, AppointmentSubmission, ProviderUnavailable
from app.discovery.schemas import (
    NO_FEED_MESSAGE,
    AppointmentIn,
    AppointmentOut,
    DoctorOut,
    DoctorPage,
    InventoryItemOut,
    InventoryOut,
    MedicineRef,
    PharmacyOut,
    PharmacyPage,
)
from app.medications.models import Medicine

router = APIRouter(tags=["discovery"])

MAX_OPEN_APPOINTMENTS = 20

Lat = Annotated[float | None, Query(ge=-90, le=90)]
Lon = Annotated[float | None, Query(ge=-180, le=180)]
Radius = Annotated[float, Query(gt=0, le=200)]
Text = Annotated[str | None, Query(max_length=100)]


def _need_both(lat: float | None, lon: float | None) -> None:
    if (lat is None) != (lon is None):
        raise AppError(422, "VALIDATION_ERROR", "Give both lat and lon, or neither.")


# ----------------------------------------------------------------------------- pharmacies
@router.get("/pharmacies/search", response_model=PharmacyPage)
def search_pharmacies(
    user: CurrentUser,
    db: DbDep,
    params: PageDep,
    q: Text = None,
    city: Text = None,
    lat: Lat = None,
    lon: Lon = None,
    radius_km: Radius = svc.DEFAULT_RADIUS_KM,
    medicine_id: uuid.UUID | None = None,
):
    _need_both(lat, lon)
    if medicine_id is not None and db.get(Medicine, medicine_id) is None:
        raise svc.not_found("medicine")
    items, total = svc.search_pharmacies(
        db,
        q=q,
        city=city,
        lat=lat,
        lon=lon,
        radius_km=radius_km,
        medicine_id=medicine_id,
        limit=params.limit,
        offset=params.offset,
    )
    return {"items": items, "total": total, "limit": params.limit, "offset": params.offset}


def _active_pharmacy(db, pharmacy_id: uuid.UUID) -> Pharmacy:
    row = db.get(Pharmacy, pharmacy_id)
    if row is None or row.status != "active":
        raise svc.not_found("pharmacy")
    return row


@router.get("/pharmacies/{pharmacy_id}", response_model=PharmacyOut)
def pharmacy_detail(pharmacy_id: uuid.UUID, user: CurrentUser, db: DbDep):
    return svc.pharmacy_out(db, _active_pharmacy(db, pharmacy_id))


@router.get("/pharmacies/{pharmacy_id}/inventory", response_model=InventoryOut)
def pharmacy_inventory(
    pharmacy_id: uuid.UUID, user: CurrentUser, db: DbDep, medicine_id: uuid.UUID | None = None
):
    """Stock reports for this pharmacy. Empty with `feed_available: false` when no source has
    ever reported for it: that is "unknown", not "out of stock"."""
    _active_pharmacy(db, pharmacy_id)
    rows = svc.inventory_items(db, pharmacy_id, medicine_id)
    return InventoryOut(
        pharmacy_id=pharmacy_id,
        feed_available=bool(rows),
        items=[
            InventoryItemOut(medicine=MedicineRef.model_validate(m), stock=stock)
            for m, stock in rows
        ],
        message=(
            "Each line is what a named source reported at the time shown. Call to confirm."
            if rows
            else NO_FEED_MESSAGE
        ),
    )


# ------------------------------------------------------------------------------- doctors
@router.get("/doctors/search", response_model=DoctorPage)
def search_doctors(
    user: CurrentUser,
    db: DbDep,
    params: PageDep,
    q: Text = None,
    specialty: Text = None,
    city: Text = None,
    language: Text = None,
    verified_only: bool = False,
    lat: Lat = None,
    lon: Lon = None,
    radius_km: Radius = svc.DEFAULT_RADIUS_KM,
):
    _need_both(lat, lon)
    items, total = svc.search_doctors(
        db,
        q=q,
        specialty=specialty,
        city=city,
        language=language,
        verified_only=verified_only,
        lat=lat,
        lon=lon,
        radius_km=radius_km,
        limit=params.limit,
        offset=params.offset,
    )
    return {"items": items, "total": total, "limit": params.limit, "offset": params.offset}


@router.get("/doctors/specialties", response_model=list[str])
def specialties(user: CurrentUser, db: DbDep):
    names = db.scalars(
        select(func.unnest(Doctor.specialties).label("s"))
        .where(Doctor.status == "active")
        .distinct()
    ).all()
    return sorted(names)


@router.get("/doctors/{doctor_id}", response_model=DoctorOut)
def doctor_detail(doctor_id: uuid.UUID, user: CurrentUser, db: DbDep):
    doctor = db.get(Doctor, doctor_id)
    if doctor is None or doctor.status != "active":
        raise svc.not_found("doctor")
    return svc.build_doctors(db, [(doctor, None)])[0]


# ------------------------------------------------------------------------- appointments
def status_text(appt: Appointment, doctor: Doctor) -> str:
    phone = f" Call {doctor.phone} to book." if doctor.phone else " Call the clinic to book."
    match appt.status:
        case "request_only":
            return "Saved in this app only. It has NOT been sent to the clinic." + phone
        case "sent":
            return (
                "Sent to the clinic's booking system. Waiting for the clinic to reply. "
                "This is not confirmed yet."
            )
        case "confirmed":
            when = (
                appt.provider_responded_at.date().isoformat() if appt.provider_responded_at else ""
            )
            return f"Confirmed by the clinic on {when}."
        case "declined":
            return "The clinic could not accept this request." + phone
        case _:
            if appt.mode == "request_only":
                return "Cancelled in this app. The clinic was never notified."
            return "Cancelled here. Contact the clinic to make sure they know."


def _appointment_out(appt: Appointment, doctor: Doctor) -> AppointmentOut:
    return AppointmentOut(
        id=appt.id,
        doctor=svc.doctor_brief(doctor),
        preferred_date=appt.preferred_date,
        preferred_window=appt.preferred_window,
        reason=appt.reason,
        mode=appt.mode,
        status=appt.status,
        status_text=status_text(appt, doctor),
        provider_reference=appt.provider_reference,
        provider_responded_at=appt.provider_responded_at,
        provider_message=appt.provider_message,
        created_at=appt.created_at,
    )


def _owned_appointment(db, user, appointment_id: uuid.UUID) -> tuple[Appointment, Doctor]:
    appt = db.get(Appointment, appointment_id)
    if appt is None or appt.patient_user_id != user.id:
        raise svc.not_found("appointment")
    return appt, db.get(Doctor, appt.doctor_id)


@router.post("/appointments", response_model=AppointmentOut, status_code=201)
def request_appointment(body: AppointmentIn, request: Request, user: CurrentUser, db: DbDep):
    doctor = db.get(Doctor, body.doctor_id)
    if doctor is None or doctor.status != "active":
        raise svc.not_found("doctor")

    open_count = db.scalar(
        select(func.count())
        .select_from(Appointment)
        .where(
            Appointment.patient_user_id == user.id,
            Appointment.status.in_(("request_only", "sent", "confirmed")),
        )
    )
    if (open_count or 0) >= MAX_OPEN_APPOINTMENTS:
        raise AppError(409, "APPOINTMENT_LIMIT", "Cancel an older request before adding another.")
    duplicate = db.scalar(
        select(Appointment.id).where(
            Appointment.patient_user_id == user.id,
            Appointment.doctor_id == doctor.id,
            Appointment.preferred_date == body.preferred_date,
            Appointment.preferred_window == body.preferred_window,
            Appointment.status.in_(("request_only", "sent", "confirmed")),
        )
    )
    if duplicate is not None:
        raise AppError(
            409, "ALREADY_REQUESTED", "You already have a request for that doctor, day and time."
        )

    appt = Appointment(
        id=uuid.uuid4(),
        patient_user_id=user.id,
        doctor_id=doctor.id,
        preferred_date=body.preferred_date,
        preferred_window=body.preferred_window,
        reason=body.reason,
        mode=doctor.booking_mode,
        status="request_only",
    )
    if doctor.booking_mode == "provider":
        provider: AppointmentProvider = request.app.state.appointments
        try:
            appt.provider_reference = provider.submit(
                AppointmentSubmission(
                    appointment_id=appt.id,
                    doctor_id=doctor.id,
                    preferred_date=body.preferred_date,
                    preferred_window=body.preferred_window,
                )
            )
        except ProviderUnavailable as exc:
            # Nothing was sent and nothing is stored: the patient is told to call.
            raise AppError(
                409,
                "PROVIDER_UNAVAILABLE",
                "Online requests to this clinic are not available right now. "
                "Please call the clinic.",
            ) from exc
        appt.status = "sent"
    db.add(appt)
    # Audit holds ids and the mode only, never the reason text.
    record(
        db,
        "appointment.request",
        request,
        actor_user_id=user.id,
        resource_type="appointment",
        resource_id=appt.id,
        metadata={"mode": appt.mode},
    )
    try:
        db.commit()
    except IntegrityError as exc:  # pragma: no cover - guarded by the checks above
        db.rollback()
        raise AppError(409, "ALREADY_REQUESTED", "That request could not be saved.") from exc
    return _appointment_out(appt, doctor)


@router.get("/appointments", response_model=Page[AppointmentOut])
def list_appointments(user: CurrentUser, db: DbDep, params: PageDep):
    total = db.scalar(
        select(func.count()).select_from(Appointment).where(Appointment.patient_user_id == user.id)
    )
    rows = db.execute(
        select(Appointment, Doctor)
        .join(Doctor, Doctor.id == Appointment.doctor_id)
        .where(Appointment.patient_user_id == user.id)
        .order_by(Appointment.created_at.desc(), Appointment.id)
        .limit(params.limit)
        .offset(params.offset)
    ).all()
    return {
        "items": [_appointment_out(a, d) for a, d in rows],
        "total": total or 0,
        "limit": params.limit,
        "offset": params.offset,
    }


@router.get("/appointments/{appointment_id}", response_model=AppointmentOut)
def get_appointment(appointment_id: uuid.UUID, user: CurrentUser, db: DbDep):
    return _appointment_out(*_owned_appointment(db, user, appointment_id))


@router.post("/appointments/{appointment_id}/cancel", response_model=AppointmentOut)
def cancel_appointment(appointment_id: uuid.UUID, request: Request, user: CurrentUser, db: DbDep):
    appt, doctor = _owned_appointment(db, user, appointment_id)
    if appt.status in ("cancelled", "declined"):
        raise AppError(409, "NOT_CANCELLABLE", "That request is already closed.")
    appt.status = "cancelled"
    appt.cancelled_at = datetime.now(UTC)
    record(
        db,
        "appointment.cancel",
        request,
        actor_user_id=user.id,
        resource_type="appointment",
        resource_id=appt.id,
        metadata={"mode": appt.mode},
    )
    db.commit()
    return _appointment_out(appt, doctor)
