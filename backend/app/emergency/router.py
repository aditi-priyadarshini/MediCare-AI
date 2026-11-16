"""Emergency: a minimum-necessary summary the patient controls, a clearly labelled practice
ambulance flow, and the provider contract for real dispatch (none integrated).

Nothing here sends anything to anyone on its own. Location coordinates are never stored or logged.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, DbDep
from app.audit.service import record
from app.core.errors import AppError
from app.core.ratelimit import enforce
from app.emergency.models import SIMULATION_FLOW, EmergencySettings, EmergencySimulation
from app.emergency.providers import (
    DispatchRequest,
    ProviderUnavailable,
    UnsupportedAmbulanceProvider,
)
from app.emergency.schemas import (
    DISPATCH_UNAVAILABLE,
    DispatchIn,
    DispatchOut,
    EmergencyAllergy,
    EmergencyCondition,
    EmergencyContactBrief,
    EmergencyMedication,
    EmergencySettingsIn,
    EmergencySettingsOut,
    EmergencyStatus,
    EmergencySummary,
    HistoryEntry,
    SimulationIn,
    SimulationOut,
)
from app.medications.models import Medication
from app.patients.models import (
    EmergencyContact,
    PatientAllergy,
    PatientCondition,
    PatientProfile,
)

router = APIRouter(prefix="/emergency", tags=["emergency"])

MAX_SIMULATIONS_LISTED = 20
_SEVERITY_ORDER = {"severe": 0, "moderate": 1, "mild": 2, "unknown": 3}


def _now() -> datetime:
    return datetime.now(UTC)


def _settings_for(db: Session, user) -> EmergencySettingsOut:
    row = db.scalar(select(EmergencySettings).where(EmergencySettings.patient_user_id == user.id))
    return EmergencySettingsOut.model_validate(row) if row else EmergencySettingsOut()


# ----------------------------------------------------------------------- status
@router.get("/status", response_model=EmergencyStatus)
def emergency_status(request: Request, user: CurrentUser):
    unsupported = isinstance(request.app.state.ambulance, UnsupportedAmbulanceProvider)
    return EmergencyStatus(dispatch_available=not unsupported)


# --------------------------------------------------------------------- settings
@router.get("/settings", response_model=EmergencySettingsOut)
def get_settings(user: CurrentUser, db: DbDep):
    return _settings_for(db, user)


@router.put("/settings", response_model=EmergencySettingsOut)
def put_settings(body: EmergencySettingsIn, request: Request, user: CurrentUser, db: DbDep):
    row = db.scalar(select(EmergencySettings).where(EmergencySettings.patient_user_id == user.id))
    if row is None:
        row = EmergencySettings(patient_user_id=user.id)
        db.add(row)
    for field, value in body.model_dump().items():
        setattr(row, field, value)
    record(
        db,
        "emergency.settings.update",
        request,
        user.id,
        "emergency_settings",
        user.id,
        body.model_dump(),
    )
    db.commit()
    return EmergencySettingsOut.model_validate(row)


# ---------------------------------------------------------------------- summary
@router.get("/summary", response_model=EmergencySummary)
def emergency_summary(request: Request, user: CurrentUser, db: DbDep):
    """The patient's own preview of what they would show a responder. Sent nowhere."""
    s = _settings_for(db, user)
    profile = db.scalar(select(PatientProfile).where(PatientProfile.user_id == user.id))
    out = EmergencySummary(
        generated_at=_now(),
        display_name=profile.display_name if profile else "Unknown",
        settings=s,
        limitations=[
            "Prepared from what the patient entered. It may be incomplete or out of date, and "
            "it is not a substitute for asking the patient or checking their documents.",
            "Nothing on this page has been sent to anyone.",
        ],
    )
    counts: dict[str, int] = {}

    if s.include_blood_group and profile is not None and profile.blood_group:
        out.blood_group = profile.blood_group
        out.blood_group_verification_status = profile.blood_group_verification_status
        counts["blood_group"] = 1

    if s.include_allergies:
        rows = db.scalars(
            select(PatientAllergy).where(
                PatientAllergy.patient_user_id == user.id, PatientAllergy.status == "active"
            )
        ).all()
        rows = sorted(
            rows, key=lambda r: (_SEVERITY_ORDER.get(r.severity or "unknown", 3), r.substance)
        )
        out.allergies = [
            EmergencyAllergy(
                substance=r.substance,
                reaction=r.reaction,
                severity=r.severity,
                verification_status=r.verification_status,
            )
            for r in rows
        ]
        counts["allergies"] = len(rows)

    if s.include_conditions:
        rows = db.scalars(
            select(PatientCondition)
            .where(PatientCondition.patient_user_id == user.id, PatientCondition.status == "active")
            .order_by(PatientCondition.display_name)
        ).all()
        out.conditions = [
            EmergencyCondition(
                display_name=r.display_name, verification_status=r.verification_status
            )
            for r in rows
        ]
        counts["conditions"] = len(rows)

    if s.include_medications:
        rows = db.scalars(
            select(Medication)
            .where(Medication.patient_user_id == user.id, Medication.status == "active")
            .order_by(Medication.display_name)
        ).all()
        out.medications = [
            EmergencyMedication(
                display_name=r.display_name,
                strength_text=r.strength_text,
                dose_text=r.dose_text,
                status=r.status,
            )
            for r in rows
        ]
        out.limitations.append(
            "A medicine being listed does not prove it is currently being taken."
        )
        counts["medications"] = len(rows)

    if s.include_contacts:
        rows = db.scalars(
            select(EmergencyContact)
            .where(EmergencyContact.patient_user_id == user.id)
            .order_by(EmergencyContact.is_primary.desc(), EmergencyContact.created_at)
        ).all()
        out.contacts = [
            EmergencyContactBrief(
                name=r.name,
                relationship=r.relationship,
                phone_e164=r.phone_e164,
                is_primary=r.is_primary,
            )
            for r in rows
        ]
        counts["contacts"] = len(rows)

    record(db, "emergency.summary.view", request, user.id, "emergency_summary", user.id, counts)
    db.commit()
    return out


# ------------------------------------------------------------------- simulation
def _is_open(row: EmergencySimulation) -> bool:
    return row.status in SIMULATION_FLOW and row.status != SIMULATION_FLOW[-1]


def _simulation_out(row: EmergencySimulation) -> SimulationOut:
    is_open = _is_open(row)
    next_status = SIMULATION_FLOW[SIMULATION_FLOW.index(row.status) + 1] if is_open else None
    return SimulationOut(
        id=row.id,
        status=row.status,
        location_shared=row.location_shared,
        is_open=is_open,
        next_status=next_status,
        history=[HistoryEntry(**h) for h in row.history],
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _owned_simulation(db: Session, sim_id: uuid.UUID, user) -> EmergencySimulation:
    row = db.scalar(
        select(EmergencySimulation).where(
            EmergencySimulation.id == sim_id, EmergencySimulation.patient_user_id == user.id
        )
    )
    if row is None:
        raise AppError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.")
    return row


@router.post("/simulations", response_model=SimulationOut, status_code=201)
def start_simulation(body: SimulationIn, request: Request, user: CurrentUser, db: DbDep):
    enforce(request, "emergency-sim", str(user.id), 10, 3600)
    open_rows = db.scalars(
        select(EmergencySimulation).where(
            EmergencySimulation.patient_user_id == user.id,
            EmergencySimulation.status.in_(SIMULATION_FLOW[:-1]),
        )
    ).all()
    if open_rows:
        raise AppError(
            409,
            "SIMULATION_OPEN",
            "Finish or cancel your current practice run before starting another.",
        )
    at = _now()
    row = EmergencySimulation(
        patient_user_id=user.id,
        mode="simulated",
        status="requested",
        location_shared=body.share_location,
        history=[{"status": "requested", "at": at.isoformat()}],
    )
    db.add(row)
    db.flush()
    record(
        db,
        "emergency.simulation.start",
        request,
        user.id,
        "emergency_simulation",
        row.id,
        {"location_shared": body.share_location},
    )
    db.commit()
    return _simulation_out(row)


@router.get("/simulations", response_model=list[SimulationOut])
def list_simulations(user: CurrentUser, db: DbDep):
    rows = db.scalars(
        select(EmergencySimulation)
        .where(EmergencySimulation.patient_user_id == user.id)
        .order_by(EmergencySimulation.created_at.desc())
        .limit(MAX_SIMULATIONS_LISTED)
    ).all()
    return [_simulation_out(r) for r in rows]


@router.post("/simulations/{sim_id}/advance", response_model=SimulationOut)
def advance_simulation(sim_id: uuid.UUID, request: Request, user: CurrentUser, db: DbDep):
    """Move the practice run one step on. Only the patient's own tap does this: no clock, no
    provider, no timer, so the status can never imply something happened by itself."""
    row = _owned_simulation(db, sim_id, user)
    if not _is_open(row):
        raise AppError(409, "SIMULATION_FINISHED", "This practice run has already finished.")
    nxt = SIMULATION_FLOW[SIMULATION_FLOW.index(row.status) + 1]
    row.status = nxt
    row.history = [*row.history, {"status": nxt, "at": _now().isoformat()}]
    record(
        db,
        "emergency.simulation.advance",
        request,
        user.id,
        "emergency_simulation",
        row.id,
        {"status": nxt},
    )
    db.commit()
    return _simulation_out(row)


@router.post("/simulations/{sim_id}/cancel", response_model=SimulationOut)
def cancel_simulation(sim_id: uuid.UUID, request: Request, user: CurrentUser, db: DbDep):
    row = _owned_simulation(db, sim_id, user)
    if not _is_open(row):
        raise AppError(409, "SIMULATION_FINISHED", "This practice run has already finished.")
    row.status = "cancelled"
    row.history = [*row.history, {"status": "cancelled", "at": _now().isoformat()}]
    record(db, "emergency.simulation.cancel", request, user.id, "emergency_simulation", row.id)
    db.commit()
    return _simulation_out(row)


# --------------------------------------------------------------- real dispatch
@router.post("/dispatch-requests", response_model=DispatchOut, status_code=201)
def request_dispatch(body: DispatchIn, request: Request, user: CurrentUser, db: DbDep):
    """Ask the configured ambulance provider for help. With no provider this always says so.

    A result is shown as accepted only when the provider returns its own reference. Coordinates go
    to the provider and nowhere else: they are not stored, logged or audited.
    """
    enforce(request, "emergency-dispatch", str(user.id), 5, 3600)
    request_id = uuid.uuid4()
    provider = request.app.state.ambulance
    try:
        acceptance = provider.request(DispatchRequest(request_id, body.latitude, body.longitude))
        if not acceptance.reference or not acceptance.reference.strip():
            raise ProviderUnavailable("Acceptance without a provider reference.")
    except ProviderUnavailable:
        record(
            db,
            "emergency.dispatch",
            request,
            user.id,
            "emergency_dispatch",
            request_id,
            {"outcome": "unavailable"},
        )
        db.commit()
        raise AppError(503, "AMBULANCE_PROVIDER_UNAVAILABLE", DISPATCH_UNAVAILABLE) from None
    record(
        db,
        "emergency.dispatch",
        request,
        user.id,
        "emergency_dispatch",
        request_id,
        {"outcome": "accepted", "provider_reference": acceptance.reference},
    )
    db.commit()
    return DispatchOut(
        provider_reference=acceptance.reference.strip(), accepted_at=acceptance.accepted_at
    )
