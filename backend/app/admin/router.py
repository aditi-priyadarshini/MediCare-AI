import uuid
from datetime import datetime

from fastapi import APIRouter, Request
from pydantic import BaseModel
from sqlalchemy import func, select

from app.api.deps import AdminUser, DbDep
from app.audit.service import record
from app.core.pagination import Page, PageDep
from app.identity.models import User

router = APIRouter(prefix="/admin", tags=["admin"])


class AdminUserOut(BaseModel):
    """Account-level fields only. Admins get no default access to patient health data."""

    id: uuid.UUID
    email: str
    role: str
    is_active: bool
    email_verified: bool
    created_at: datetime


@router.get("/users", response_model=Page[AdminUserOut])
def list_users(request: Request, admin: AdminUser, db: DbDep, params: PageDep):
    total = db.scalar(select(func.count()).select_from(User)) or 0
    rows = db.scalars(
        select(User).order_by(User.created_at.desc()).limit(params.limit).offset(params.offset)
    ).all()
    record(db, "admin.users_listed", request, actor_user_id=admin.id, resource_type="user")
    db.commit()
    items = [
        AdminUserOut(
            id=u.id,
            email=u.email,
            role=u.role,
            is_active=u.is_active,
            email_verified=u.email_verified_at is not None,
            created_at=u.created_at,
        )
        for u in rows
    ]
    return {"items": items, "total": total, "limit": params.limit, "offset": params.offset}
