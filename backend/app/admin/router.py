"""Admin console API: accounts, audit review, feedback moderation, catalogue and an overview.

Admins get no default access to patient health data. What they can see here is account
metadata (never passwords or sessions), audit events about *administration and sign-in*
(not health-data access), platform feedback, and shared reference data. Every read of the
audit log and feedback queue is itself audited, and every state change is audited.
"""

import uuid
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import and_, func, or_, select

from app.api.deps import AdminUser, DbDep
from app.audit.models import AuditLog
from app.audit.service import record
from app.core.errors import AppError
from app.core.pagination import Page, PageDep
from app.feedback.models import Feedback
from app.identity import service as identity
from app.identity.models import User
from app.medications.models import Medicine
from app.safety.models import ReferenceSource, SafetyRule

router = APIRouter(prefix="/admin", tags=["admin"])

# Audit events an administrator may review. Events about reading or sharing a patient's own
# health data (records, shares, emergency, assistant) are for that patient, not for admins.
AUDIT_VISIBLE_PREFIXES = ("admin.", "auth.", "feedback.")


def _not_found() -> AppError:
    return AppError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.")


# ------------------------------------------------------------------------------- users
class AdminUserOut(BaseModel):
    """Account-level fields only. Admins get no default access to patient health data."""

    id: uuid.UUID
    email: str
    role: str
    is_active: bool
    email_verified: bool
    created_at: datetime


def _user_out(u: User) -> AdminUserOut:
    return AdminUserOut(
        id=u.id,
        email=u.email,
        role=u.role,
        is_active=u.is_active,
        email_verified=u.email_verified_at is not None,
        created_at=u.created_at,
    )


@router.get("/users", response_model=Page[AdminUserOut])
def list_users(request: Request, admin: AdminUser, db: DbDep, params: PageDep):
    total = db.scalar(select(func.count()).select_from(User)) or 0
    rows = db.scalars(
        select(User).order_by(User.created_at.desc()).limit(params.limit).offset(params.offset)
    ).all()
    record(db, "admin.users_listed", request, actor_user_id=admin.id, resource_type="user")
    db.commit()
    return {
        "items": [_user_out(u) for u in rows],
        "total": total,
        "limit": params.limit,
        "offset": params.offset,
    }


def _set_active(db: DbDep, request: Request, admin: User, user_id: uuid.UUID, active: bool):
    target = db.get(User, user_id)
    if target is None:
        raise _not_found()
    if not active:
        if target.id == admin.id:
            raise AppError(409, "SELF_DEACTIVATION", "You cannot deactivate your own account.")
        # An admin cannot deactivate themselves, so at least one active admin always remains.
    if target.is_active != active:
        target.is_active = active
        if not active:
            identity.revoke_all_sessions(db, target.id)  # signs them out everywhere, now
        record(
            db,
            "admin.user_reactivate" if active else "admin.user_deactivate",
            request,
            actor_user_id=admin.id,
            resource_type="user",
            resource_id=target.id,
        )
        db.commit()
    return _user_out(target)


@router.post("/users/{user_id}/deactivate", response_model=AdminUserOut)
def deactivate_user(user_id: uuid.UUID, request: Request, admin: AdminUser, db: DbDep):
    return _set_active(db, request, admin, user_id, False)


@router.post("/users/{user_id}/reactivate", response_model=AdminUserOut)
def reactivate_user(user_id: uuid.UUID, request: Request, admin: AdminUser, db: DbDep):
    return _set_active(db, request, admin, user_id, True)


# --------------------------------------------------------------------------- audit log
class AuditOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    actor_user_id: uuid.UUID | None
    action: str
    resource_type: str | None
    resource_id: str | None
    ip: str | None
    request_id: str | None
    metadata: dict = Field(validation_alias="event_metadata")
    created_at: datetime


def _visible_audit():
    return or_(*[AuditLog.action.startswith(p, autoescape=True) for p in AUDIT_VISIBLE_PREFIXES])


@router.get("/audit-logs", response_model=Page[AuditOut])
def list_audit_logs(
    request: Request,
    admin: AdminUser,
    db: DbDep,
    params: PageDep,
    action: Annotated[str | None, Query(max_length=64)] = None,
    actor_user_id: uuid.UUID | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
):
    """Newest first. `action` matches a prefix (e.g. `admin.rule`)."""
    conditions = [_visible_audit()]
    if action:
        conditions.append(AuditLog.action.startswith(action, autoescape=True))
    if actor_user_id:
        conditions.append(AuditLog.actor_user_id == actor_user_id)
    if since:
        conditions.append(AuditLog.created_at >= since)
    if until:
        conditions.append(AuditLog.created_at < until)
    where = and_(*conditions)
    total = db.scalar(select(func.count()).select_from(AuditLog).where(where)) or 0
    rows = db.scalars(
        select(AuditLog)
        .where(where)
        .order_by(AuditLog.created_at.desc(), AuditLog.id)
        .limit(params.limit)
        .offset(params.offset)
    ).all()
    record(
        db,
        "admin.audit_viewed",
        request,
        actor_user_id=admin.id,
        resource_type="audit_log",
        metadata={"filtered": bool(action or actor_user_id or since or until), "rows": len(rows)},
    )
    db.commit()
    return {"items": rows, "total": total, "limit": params.limit, "offset": params.offset}


# ---------------------------------------------------------------------------- feedback
class AdminFeedbackOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    user_id: uuid.UUID
    category: str
    message: str
    page: str | None
    status: str
    moderator_note: str | None
    moderated_by_user_id: uuid.UUID | None
    moderated_at: datetime | None
    created_at: datetime


class ModerateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["new", "reviewed", "actioned", "dismissed"]
    note: Annotated[str | None, Field(max_length=1000)] = None


@router.get("/feedback", response_model=Page[AdminFeedbackOut])
def list_feedback(
    request: Request,
    admin: AdminUser,
    db: DbDep,
    params: PageDep,
    status: Annotated[str, Query(pattern="^(new|reviewed|actioned|dismissed|all)$")] = "new",
):
    base = select(Feedback)
    if status != "all":
        base = base.where(Feedback.status == status)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.scalars(
        base.order_by(Feedback.created_at.desc()).limit(params.limit).offset(params.offset)
    ).all()
    record(
        db,
        "admin.feedback_listed",
        request,
        actor_user_id=admin.id,
        resource_type="feedback",
        metadata={"status": status, "rows": len(rows)},
    )
    db.commit()
    return {"items": rows, "total": total, "limit": params.limit, "offset": params.offset}


@router.post("/feedback/{feedback_id}/moderate", response_model=AdminFeedbackOut)
def moderate_feedback(
    feedback_id: uuid.UUID, body: ModerateIn, request: Request, admin: AdminUser, db: DbDep
):
    row = db.get(Feedback, feedback_id)
    if row is None:
        raise _not_found()
    row.status = body.status
    row.moderator_note = (body.note or "").strip() or None
    if body.status == "new":
        row.moderated_by_user_id = row.moderated_at = None
    else:
        row.moderated_by_user_id, row.moderated_at = admin.id, datetime.now(UTC)
    record(
        db,
        "admin.feedback_moderate",
        request,
        actor_user_id=admin.id,
        resource_type="feedback",
        resource_id=row.id,
        metadata={"status": body.status},
    )
    db.commit()
    return row


# ---------------------------------------------------------------------------- catalogue
class AdminMedicineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    form: str | None
    strength_text: str | None
    route: str | None
    release_type: str | None
    source: str
    created_at: datetime


@router.get("/medicines", response_model=Page[AdminMedicineOut])
def list_catalogue(
    admin: AdminUser,
    db: DbDep,
    params: PageDep,
    q: Annotated[str | None, Query(max_length=50)] = None,
):
    base = select(Medicine)
    if q and q.strip():
        needle = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        base = base.where(Medicine.name.ilike(f"%{needle}%", escape="\\"))
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.scalars(
        base.order_by(func.lower(Medicine.name), Medicine.strength_text)
        .limit(params.limit)
        .offset(params.offset)
    ).all()
    return {"items": rows, "total": total, "limit": params.limit, "offset": params.offset}


# ---------------------------------------------------------------------------- overview
class OverviewOut(BaseModel):
    users: int
    inactive_users: int
    feedback_new: int
    rules_active: int
    rules_unreviewed: int
    sources: int
    medicines: int


@router.get("/overview", response_model=OverviewOut)
def overview(admin: AdminUser, db: DbDep):
    def count(stmt) -> int:
        return db.scalar(stmt) or 0

    return OverviewOut(
        users=count(select(func.count()).select_from(User)),
        inactive_users=count(
            select(func.count()).select_from(User).where(User.is_active.is_(False))
        ),
        feedback_new=count(
            select(func.count()).select_from(Feedback).where(Feedback.status == "new")
        ),
        rules_active=count(
            select(func.count()).select_from(SafetyRule).where(SafetyRule.status == "active")
        ),
        rules_unreviewed=count(
            select(func.count())
            .select_from(SafetyRule)
            .where(SafetyRule.status == "active", SafetyRule.review_status == "unreviewed")
        ),
        sources=count(select(func.count()).select_from(ReferenceSource)),
        medicines=count(select(func.count()).select_from(Medicine)),
    )
