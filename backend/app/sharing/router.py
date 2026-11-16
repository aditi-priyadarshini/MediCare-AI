"""Sharing: the patient manages grants; a recipient proves control of the named email address and
then reads only the shared slice.

Public routes (`/share-access/*`) take no session cookie and so are not CSRF targets. They never
reveal whether a token exists: unknown, expired and revoked links all get the same answers.
"""

import logging
import uuid
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Header, Request
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DbDep, SettingsDep
from app.audit.service import record
from app.core.errors import AppError
from app.core.pagination import Page, PageDep
from app.core.ratelimit import client_ip, enforce
from app.core.security import hash_token
from app.patients.models import PatientProfile
from app.sharing import service as svc
from app.sharing.models import ShareAccessLog, ShareGrant
from app.sharing.schemas import (
    AccessLogOut,
    SessionOut,
    ShareCreated,
    ShareCreateIn,
    SharedSummary,
    SharedView,
    ShareOut,
    ShareScopeIn,
    StartOut,
    TokenIn,
    VerifyIn,
)

router = APIRouter(tags=["sharing"])
log = logging.getLogger("app.sharing")

CODE_INVALID = (
    "That code is not valid, or the link is no longer active. Request a new code or ask the "
    "patient for a new link."
)


def _owned_grant(db, share_id: uuid.UUID, user) -> ShareGrant:
    row = db.scalar(
        select(ShareGrant).where(ShareGrant.id == share_id, ShareGrant.patient_user_id == user.id)
    )
    if row is None:
        raise AppError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.")
    return row


def _patient_name(db, user_id) -> str:
    name = db.scalar(select(PatientProfile.display_name).where(PatientProfile.user_id == user_id))
    return name or "A MediCare AI user"


# ----------------------------------------------------------------- patient side
@router.post("/shares/preview", response_model=SharedSummary)
def preview_share(body: ShareScopeIn, user: CurrentUser, db: DbDep):
    """Exactly what a recipient would see for this selection. Nothing is created or sent."""
    return svc.build_summary(db, user.id, body.categories, body.date_from, body.date_to)


@router.post("/shares", response_model=ShareCreated, status_code=201)
def create_share(
    body: ShareCreateIn, request: Request, user: CurrentUser, db: DbDep, settings: SettingsDep
):
    enforce(request, "share-create", str(user.id), 10, 3600)
    at = svc.now()
    active = db.scalar(
        select(func.count())
        .select_from(ShareGrant)
        .where(
            ShareGrant.patient_user_id == user.id,
            ShareGrant.revoked_at.is_(None),
            ShareGrant.expires_at > at,
        )
    )
    if (active or 0) >= svc.MAX_ACTIVE_GRANTS:
        raise AppError(
            409, "SHARE_LIMIT_REACHED", "Revoke a share you no longer need before creating another."
        )

    token = svc.new_token()
    grant = ShareGrant(
        patient_user_id=user.id,
        recipient_name=body.recipient_name,
        recipient_email=body.recipient_email.strip().lower(),
        token_hash=hash_token(token),
        categories=list(body.categories),
        date_from=body.date_from,
        date_to=body.date_to,
        expires_at=at + timedelta(hours=body.expires_in_hours),
    )
    db.add(grant)
    db.flush()
    # Counts and times only: no recipient address, no medical content.
    record(
        db,
        "share.create",
        request,
        user.id,
        "share_grant",
        grant.id,
        {
            "categories": list(body.categories),
            "expires_at": grant.expires_at.isoformat(),
            "date_limited": bool(body.date_from or body.date_to),
        },
    )
    db.commit()

    link = f"{settings.frontend_base_url}/shared#{token}"
    sent = False
    try:
        request.app.state.email.send(
            grant.recipient_email,
            "Health information has been shared with you on MediCare AI",
            f"{_patient_name(db, user.id)} chose to share some health information with you "
            "through MediCare AI.\n\n"
            f"Open this link: {link}\n\n"
            "You will be asked for a one-time code, which is emailed to this address when you "
            f"ask for it. The link stops working on {grant.expires_at:%d %b %Y %H:%M} UTC, and "
            "the patient can withdraw it sooner.\n\n"
            "If you were not expecting this, ignore this email.",
        )
        grant.notified_at = svc.now()
        db.commit()
        sent = True
    except Exception:  # the patient still has the link to pass on themselves
        log.error("share_notification_failed", extra={"event": "share.create"})
    return ShareCreated(share=svc.share_out(grant), link=link, notification_sent=sent)


@router.get("/shares", response_model=Page[ShareOut])
def list_shares(user: CurrentUser, db: DbDep, params: PageDep):
    base = select(ShareGrant).where(ShareGrant.patient_user_id == user.id)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.scalars(
        base.order_by(ShareGrant.created_at.desc()).limit(params.limit).offset(params.offset)
    ).all()
    return {
        "items": [svc.share_out(r) for r in rows],
        "total": total,
        "limit": params.limit,
        "offset": params.offset,
    }


@router.get("/shares/{share_id}/access", response_model=Page[AccessLogOut])
def share_access_log(share_id: uuid.UUID, user: CurrentUser, db: DbDep, params: PageDep):
    grant = _owned_grant(db, share_id, user)
    base = select(ShareAccessLog).where(ShareAccessLog.grant_id == grant.id)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.scalars(
        base.order_by(ShareAccessLog.created_at.desc(), ShareAccessLog.id)
        .limit(params.limit)
        .offset(params.offset)
    ).all()
    return {"items": rows, "total": total, "limit": params.limit, "offset": params.offset}


@router.post("/shares/{share_id}/revoke", response_model=ShareOut)
def revoke_share(share_id: uuid.UUID, request: Request, user: CurrentUser, db: DbDep):
    grant = _owned_grant(db, share_id, user)
    if grant.revoked_at is None:
        grant.revoked_at = svc.now()
        record(db, "share.revoke", request, user.id, "share_grant", grant.id)
        db.commit()
    return svc.share_out(grant)


# -------------------------------------------------------------- recipient side
@router.post("/share-access/start", response_model=StartOut, status_code=202)
def start_access(body: TokenIn, request: Request, db: DbDep, settings: SettingsDep):
    """Email a one-time code to the address the patient named. The answer is always the same."""
    enforce(request, "share-start-ip", client_ip(request), 20, 3600)
    enforce(request, "share-start", hash_token(body.token), 5, 3600)
    generic = StartOut(
        message="If this link is active, a code has been emailed to the address it was shared with."
    )
    grant = svc.grant_by_token(db, body.token)
    if grant is None:
        return generic
    status = svc.grant_status(grant)
    if status != "active":
        svc.log_access(db, grant, f"blocked_{status}", request)
        db.commit()
        return generic
    if svc.in_resend_cooldown(db, settings, grant):
        return generic

    code = svc.issue_code(db, settings, grant)
    svc.log_access(db, grant, "code_sent", request)
    db.commit()  # persist before sending so a code is never emailed without its challenge
    try:
        request.app.state.email.send(
            grant.recipient_email,
            "Your MediCare AI access code",
            f"Your access code is {code}. It expires in {settings.otp_ttl_minutes} minutes.\n\n"
            "If you did not ask for it, ignore this email.",
        )
    except Exception:
        log.error("share_code_delivery_failed", extra={"event": "share.start"})
    return generic


@router.post("/share-access/verify", response_model=SessionOut)
def verify_access(body: VerifyIn, request: Request, db: DbDep, settings: SettingsDep):
    enforce(request, "share-verify-ip", client_ip(request), 40, 3600)
    enforce(request, "share-verify", hash_token(body.token), 10, 600)
    grant = svc.grant_by_token(db, body.token)
    if grant is None:
        raise AppError(400, "SHARE_CODE_INVALID", CODE_INVALID)
    status = svc.grant_status(grant)
    if status != "active":
        svc.log_access(db, grant, f"blocked_{status}", request)
        db.commit()
        raise AppError(400, "SHARE_CODE_INVALID", CODE_INVALID)

    ok = svc.check_code(db, settings, grant, body.code)
    svc.log_access(db, grant, "verified" if ok else "code_failed", request)
    db.commit()  # failed attempts must persist
    if not ok:
        raise AppError(400, "SHARE_CODE_INVALID", CODE_INVALID)
    return SessionOut(
        session_token=svc.make_view_session(settings, grant),
        expires_in_seconds=settings.share_view_ttl_seconds,
    )


@router.get("/share-access/summary", response_model=SharedView)
def shared_summary(
    request: Request,
    db: DbDep,
    settings: SettingsDep,
    x_share_session: Annotated[str | None, Header()] = None,
):
    grant = svc.grant_from_view_session(db, settings, x_share_session)
    if grant is None:
        raise AppError(
            401, "SHARE_SESSION_INVALID", "Your access has ended. Open the link again to continue."
        )
    enforce(request, "share-view", str(grant.id), 60, 60)
    status = svc.grant_status(grant)
    if status != "active":  # revocation and expiry apply to sessions already opened
        svc.log_access(db, grant, f"blocked_{status}", request)
        db.commit()
        raise AppError(
            403, "SHARE_NOT_ACTIVE", "This share has expired or has been withdrawn by the patient."
        )

    summary = svc.build_summary(
        db, grant.patient_user_id, list(grant.categories), grant.date_from, grant.date_to
    )
    shared_by = _patient_name(db, grant.patient_user_id)
    grant.access_count = ShareGrant.access_count + 1
    grant.last_accessed_at = svc.now()
    svc.log_access(db, grant, "viewed", request)
    record(
        db,
        "share.view",
        request,
        None,
        "share_grant",
        grant.id,
        {"categories": list(grant.categories)},
    )
    db.commit()
    return SharedView(
        shared_by=shared_by,
        recipient_name=grant.recipient_name,
        expires_at=grant.expires_at,
        summary=summary,
    )
