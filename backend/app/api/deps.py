"""Authentication, CSRF and role dependencies. The backend is the authorization boundary."""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.db import get_db
from app.core.errors import AppError
from app.core.security import constant_time_equals, csrf_token_for, hash_token
from app.identity.models import SessionRecord, User
from app.identity.service import now

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}

DbDep = Annotated[Session, Depends(get_db)]


def get_settings_dep(request: Request) -> Settings:
    return request.app.state.settings


SettingsDep = Annotated[Settings, Depends(get_settings_dep)]


@dataclass
class AuthContext:
    user: User
    token: str
    csrf_token: str


def resolve_session(request: Request, db: Session, settings: Settings) -> AuthContext | None:
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        return None
    row = db.execute(
        select(SessionRecord, User)
        .join(User, User.id == SessionRecord.user_id)
        .where(SessionRecord.session_token_hash == hash_token(token))
        .where(SessionRecord.revoked_at.is_(None))
        .where(SessionRecord.expires_at > now())
        .where(User.is_active.is_(True))
    ).first()
    if row is None:
        return None
    return AuthContext(
        user=row[1], token=token, csrf_token=csrf_token_for(settings.secret_key, token)
    )


def enforce_csrf(request: Request, ctx: AuthContext) -> None:
    if request.method in SAFE_METHODS:
        return
    supplied = request.headers.get("x-csrf-token", "")
    if not supplied or not constant_time_equals(supplied, ctx.csrf_token):
        raise AppError(403, "CSRF_INVALID", "Missing or invalid CSRF token.")


def current_auth(request: Request, db: DbDep, settings: SettingsDep) -> AuthContext:
    """Any authenticated session (email may be unverified). CSRF enforced on unsafe methods."""
    ctx = resolve_session(request, db, settings)
    if ctx is None:
        raise AppError(401, "UNAUTHENTICATED", "Authentication is required.")
    enforce_csrf(request, ctx)
    return ctx


AuthDep = Annotated[AuthContext, Depends(current_auth)]


def verified_user(ctx: AuthDep, settings: SettingsDep) -> User:
    if settings.require_email_verification and ctx.user.email_verified_at is None:
        raise AppError(403, "EMAIL_NOT_VERIFIED", "Verify your email address to continue.")
    return ctx.user


CurrentUser = Annotated[User, Depends(verified_user)]


def require_role(*roles: str):
    def dependency(user: CurrentUser) -> User:
        if user.role not in roles:
            raise AppError(403, "FORBIDDEN", "You do not have permission to do that.")
        return user

    return dependency


AdminUser = Annotated[User, Depends(require_role("admin"))]
