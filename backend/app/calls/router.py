"""Phone-app devices, reminder calls and signalling (see docs/REMINDER_CALLS.md)."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Query, Request, WebSocket
from sqlalchemy import select

from app.api.deps import CurrentUser, DbDep, SettingsDep
from app.audit import service as audit
from app.calls import service as svc
from app.calls.models import Device, ReminderCall
from app.calls.schemas import (
    AcceptOut,
    CallOut,
    DeviceIn,
    DeviceOut,
    DoseBrief,
    IceOut,
)
from app.calls.signaling import handle_call_socket
from app.core.errors import AppError
from app.core.ratelimit import enforce

router = APIRouter(tags=["calls"])


def _now() -> datetime:
    return datetime.now(UTC)


def _device_out(d: Device) -> DeviceOut:
    return DeviceOut(
        id=d.id,
        platform=d.platform,
        app_version=d.app_version,
        last_seen_at=d.last_seen_at,
        can_ring=d.platform == "android" or bool(d.voip_token),
    )


# ---------------------------------------------------------------------------------- devices
@router.post("/devices", response_model=DeviceOut, status_code=201)
def register_device(body: DeviceIn, request: Request, user: CurrentUser, db: DbDep):
    """Register (or refresh) this phone. Idempotent per push token: if the token was last used
    by another account on the same phone it moves to the signed-in user, so a person who logs
    out and a family member who logs in never share a ringing phone."""
    enforce(request, "device-register", str(user.id), 20, 3600)
    now = _now()
    device = db.scalar(select(Device).where(Device.push_token == body.push_token).with_for_update())
    if device is None:
        device = Device(user_id=user.id, platform=body.platform, push_token=body.push_token)
        db.add(device)
    device.user_id = user.id
    device.platform = body.platform
    device.voip_token = body.voip_token
    device.app_version = body.app_version
    device.last_seen_at = now
    device.revoked_at = None
    db.flush()
    audit.record(db, "device.register", request, user.id, "device", device.id)
    db.commit()
    return _device_out(device)


@router.get("/devices", response_model=list[DeviceOut])
def list_devices(user: CurrentUser, db: DbDep):
    rows = db.scalars(
        select(Device)
        .where(Device.user_id == user.id, Device.revoked_at.is_(None))
        .order_by(Device.last_seen_at.desc())
    ).all()
    return [_device_out(d) for d in rows]


@router.delete("/devices/{device_id}", status_code=204)
def remove_device(device_id: uuid.UUID, request: Request, user: CurrentUser, db: DbDep):
    device = db.scalar(select(Device).where(Device.id == device_id, Device.user_id == user.id))
    if device is None:
        raise svc.not_found()
    device.revoked_at = _now()
    audit.record(db, "device.remove", request, user.id, "device", device.id)
    db.commit()


# ------------------------------------------------------------------------------------ calls
def _call_out(c: ReminderCall) -> CallOut:
    return CallOut(
        id=c.id,
        status=c.status,
        attempt=c.attempt,
        ring_expires_at=c.ring_expires_at,
        answered_at=c.answered_at,
        ended_at=c.ended_at,
        end_reason=c.end_reason,
        media_connected_at=c.media_connected_at,
        created_at=c.created_at,
    )


@router.get("/calls", response_model=list[CallOut])
def list_calls(user: CurrentUser, db: DbDep, limit: int = Query(20, ge=1, le=100)):
    rows = db.scalars(
        select(ReminderCall)
        .where(ReminderCall.patient_user_id == user.id)
        .order_by(ReminderCall.created_at.desc())
        .limit(limit)
    ).all()
    return [_call_out(c) for c in rows]


@router.get("/calls/ice-servers", response_model=IceOut)
def get_ice_servers(user: CurrentUser, settings: SettingsDep):
    return IceOut(ice_servers=svc.ice_servers(settings, user.id, _now()))


@router.get("/calls/{call_id}", response_model=CallOut)
def get_call(call_id: uuid.UUID, user: CurrentUser, db: DbDep):
    return _call_out(svc.owned_call(db, call_id, user.id))


@router.post("/calls/{call_id}/accept", response_model=AcceptOut)
def accept_call(
    call_id: uuid.UUID, request: Request, user: CurrentUser, db: DbDep, settings: SettingsDep
):
    """The patient answered. Returns what the call screen shows (the medicine is named here,
    to the signed-in patient, and never in the push) plus a one-shot signalling ticket."""
    now = _now()
    call = svc.owned_call(db, call_id, user.id, lock=True)
    try:
        svc.accept(db, call, now)
    except AppError:
        db.commit()  # persist a 'missed' / 'completed' transition made while refusing
        raise
    audit.record(db, "call.accept", request, user.id, "reminder_call", call.id)
    brief = svc.dose_summary(db, call)
    db.commit()
    return AcceptOut(
        call=_call_out(call),
        dose=DoseBrief(**brief),
        ticket=svc.make_ticket(settings, call.id, user.id),
        ws_path=f"/api/v1/calls/{call.id}/ws",
        ice_servers=svc.ice_servers(settings, user.id, now),
        ticket_ttl_seconds=settings.call_ticket_ttl_seconds,
    )


@router.post("/calls/{call_id}/decline", response_model=CallOut)
def decline_call(call_id: uuid.UUID, request: Request, user: CurrentUser, db: DbDep):
    call = svc.owned_call(db, call_id, user.id, lock=True)
    svc.decline(call, _now())
    audit.record(db, "call.decline", request, user.id, "reminder_call", call.id)
    db.commit()
    return _call_out(call)


@router.post("/calls/{call_id}/end", response_model=CallOut)
def end_call(call_id: uuid.UUID, request: Request, user: CurrentUser, db: DbDep):
    call = svc.owned_call(db, call_id, user.id, lock=True)
    svc.end(call, _now())
    db.commit()
    return _call_out(call)


# --------------------------------------------------------------------------- signalling
@router.websocket("/calls/{call_id}/ws")
async def call_socket(websocket: WebSocket, call_id: uuid.UUID, ticket: str = Query(...)):
    await handle_call_socket(websocket, call_id, ticket)
