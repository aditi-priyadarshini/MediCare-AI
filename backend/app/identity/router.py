import base64
import hashlib
import secrets

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.deps import AuthDep, DbDep, SettingsDep, enforce_csrf, resolve_session
from app.audit.service import record
from app.core.errors import AppError
from app.core.ratelimit import enforce, rate_limit_ip
from app.core.security import (
    BadSignature,
    email_digest,
    hash_password,
    signer,
    verify_password,
)
from app.identity import service as svc
from app.identity.models import OAuthAccount, User
from app.identity.providers import OAuthError
from app.identity.schemas import (
    AuthState,
    ForgotPasswordIn,
    LoginIn,
    RegisterIn,
    ResetPasswordIn,
    StatusOut,
    UserOut,
    VerifyEmailIn,
)
from app.patients.models import PatientProfile

router = APIRouter(prefix="/auth", tags=["auth"])

OAUTH_COOKIE = "mc_oauth"
OAUTH_COOKIE_PATH = "/api/v1/auth/google"


def _state(db, settings, user: User, token: str) -> AuthState:
    name = db.scalar(select(PatientProfile.display_name).where(PatientProfile.user_id == user.id))
    return AuthState(
        user=UserOut(
            id=user.id,
            email=user.email,
            role=user.role,
            email_verified=user.email_verified_at is not None,
            display_name=name,
        ),
        csrf_token=svc.csrf_for(settings, token),
    )


# ------------------------------------------------------------------ registration
@router.post(
    "/register",
    status_code=201,
    response_model=AuthState,
    dependencies=[Depends(rate_limit_ip("register", 10, 3600))],
)
def register(
    body: RegisterIn, request: Request, response: Response, db: DbDep, settings: SettingsDep
):
    problem = svc.validate_password(body.password, body.email)
    if problem:
        raise AppError(422, "WEAK_PASSWORD", problem)
    if svc.get_user_by_email(db, body.email):
        raise AppError(
            409, "EMAIL_ALREADY_REGISTERED", "An account with this email already exists."
        )
    try:
        user = svc.create_user(db, body.email, hash_password(body.password), body.display_name)
    except IntegrityError:
        db.rollback()
        raise AppError(
            409, "EMAIL_ALREADY_REGISTERED", "An account with this email already exists."
        ) from None
    token = svc.create_session(db, settings, user)
    record(
        db,
        "auth.register",
        request,
        actor_user_id=user.id,
        resource_type="user",
        resource_id=user.id,
    )
    db.commit()
    svc.issue_otp(db, settings, request.app.state.email, user, svc.PURPOSE_VERIFY)
    svc.set_session_cookie(response, settings, token)
    return _state(db, settings, user, token)


# ------------------------------------------------------------------------ login
@router.post(
    "/login",
    response_model=AuthState,
    dependencies=[Depends(rate_limit_ip("login", 30, 300))],
)
def login(body: LoginIn, request: Request, response: Response, db: DbDep, settings: SettingsDep):
    enforce(request, "login-email", email_digest(body.email), 10, 900)
    user = svc.get_user_by_email(db, body.email)
    ok = verify_password(user.password_hash if user else None, body.password)
    if not (user and ok and user.is_active):
        record(db, "auth.login_failed", request, actor_user_id=user.id if user else None)
        db.commit()
        raise AppError(401, "INVALID_CREDENTIALS", "Incorrect email or password.")
    previous = resolve_session(request, db, settings)
    if previous:
        svc.revoke_session_by_token(db, previous.token)  # rotate: never reuse a prior session
    token = svc.create_session(db, settings, user)
    record(db, "auth.login", request, actor_user_id=user.id)
    db.commit()
    svc.set_session_cookie(response, settings, token)
    return _state(db, settings, user, token)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: DbDep, settings: SettingsDep):
    ctx = resolve_session(request, db, settings)
    if ctx is not None:
        enforce_csrf(request, ctx)
        svc.revoke_session_by_token(db, ctx.token)
        record(db, "auth.logout", request, actor_user_id=ctx.user.id)
        db.commit()
    svc.clear_session_cookie(response, settings)
    response.status_code = 204
    return response


@router.get("/me", response_model=AuthState)
def me(ctx: AuthDep, db: DbDep, settings: SettingsDep):
    return _state(db, settings, ctx.user, ctx.token)


# ----------------------------------------------------------- email verification
@router.post("/email/verify", response_model=AuthState)
def verify_email(
    body: VerifyEmailIn,
    request: Request,
    response: Response,
    ctx: AuthDep,
    db: DbDep,
    settings: SettingsDep,
):
    user = ctx.user
    enforce(request, "verify", str(user.id), 10, 600)
    if user.email_verified_at is not None:
        return _state(db, settings, user, ctx.token)
    if not svc.check_otp(db, settings, user, svc.PURPOSE_VERIFY, body.code):
        record(db, "auth.email_verify_failed", request, actor_user_id=user.id)
        db.commit()
        raise AppError(400, "INVALID_OR_EXPIRED_CODE", "That code is incorrect or has expired.")
    user.email_verified_at = svc.now()
    svc.revoke_session_by_token(db, ctx.token)  # rotate on privilege change
    token = svc.create_session(db, settings, user)
    record(db, "auth.email_verified", request, actor_user_id=user.id)
    db.commit()
    svc.set_session_cookie(response, settings, token)
    return _state(db, settings, user, token)


@router.post("/email/resend", status_code=202, response_model=StatusOut)
def resend_verification(request: Request, ctx: AuthDep, db: DbDep, settings: SettingsDep):
    user = ctx.user
    if user.email_verified_at is not None:
        raise AppError(409, "ALREADY_VERIFIED", "Your email is already verified.")
    enforce(request, "resend", str(user.id), 5, 3600)
    if svc.in_resend_cooldown(db, settings, user.id, svc.PURPOSE_VERIFY):
        raise AppError(
            429,
            "RESEND_COOLDOWN",
            "Please wait a moment before requesting another code.",
            headers={"Retry-After": str(settings.otp_resend_cooldown_seconds)},
        )
    svc.issue_otp(db, settings, request.app.state.email, user, svc.PURPOSE_VERIFY)
    return StatusOut(status="sent")


# --------------------------------------------------------------- password reset
@router.post(
    "/password/forgot",
    status_code=202,
    response_model=StatusOut,
    dependencies=[Depends(rate_limit_ip("forgot", 10, 900))],
)
def forgot_password(body: ForgotPasswordIn, request: Request, db: DbDep, settings: SettingsDep):
    enforce(request, "forgot-email", email_digest(body.email), 3, 3600)
    user = svc.get_user_by_email(db, body.email)
    if (
        user
        and user.is_active
        and not svc.in_resend_cooldown(db, settings, user.id, svc.PURPOSE_RESET)
    ):
        svc.issue_otp(db, settings, request.app.state.email, user, svc.PURPOSE_RESET)
        record(db, "auth.password_reset_requested", request, actor_user_id=user.id)
        db.commit()
    # Identical response whether or not the account exists.
    return StatusOut(status="if_account_exists_email_sent")


@router.post(
    "/password/reset",
    response_model=StatusOut,
    dependencies=[Depends(rate_limit_ip("reset", 20, 900))],
)
def reset_password(
    body: ResetPasswordIn, request: Request, response: Response, db: DbDep, settings: SettingsDep
):
    problem = svc.validate_password(body.new_password, body.email)
    if problem:
        raise AppError(422, "WEAK_PASSWORD", problem)
    user = svc.get_user_by_email(db, body.email)
    if not (
        user and user.is_active and svc.check_otp(db, settings, user, svc.PURPOSE_RESET, body.code)
    ):
        raise AppError(400, "INVALID_OR_EXPIRED_CODE", "That code is incorrect or has expired.")
    user.password_hash = hash_password(body.new_password)
    if user.email_verified_at is None:
        user.email_verified_at = svc.now()  # they proved control of the inbox
    svc.revoke_all_sessions(db, user.id)
    record(db, "auth.password_reset", request, actor_user_id=user.id)
    db.commit()
    svc.clear_session_cookie(response, settings)
    return StatusOut(status="password_updated")


# ------------------------------------------------------------------ google oauth
def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


@router.get("/providers")
def providers(settings: SettingsDep):
    """Public: which sign-in methods are available (lets the UI hide unconfigured ones)."""
    return {"google": settings.google_enabled}


@router.get("/google/start")
def google_start(request: Request, settings: SettingsDep):
    provider = request.app.state.google
    if provider is None:
        raise AppError(503, "PROVIDER_UNAVAILABLE", "Google sign-in is not configured.")
    state, verifier = secrets.token_urlsafe(24), secrets.token_urlsafe(48)
    challenge = _b64url(hashlib.sha256(verifier.encode()).digest())
    resp = RedirectResponse(provider.authorization_url(state, challenge), status_code=302)
    resp.set_cookie(
        OAUTH_COOKIE,
        signer(settings.secret_key, "oauth").dumps({"s": state, "v": verifier}),
        max_age=600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path=OAUTH_COOKIE_PATH,
    )
    return resp


@router.get("/google/callback")
def google_callback(
    request: Request,
    db: DbDep,
    settings: SettingsDep,
    code: str | None = None,
    state: str | None = None,
):
    base = settings.frontend_base_url

    def fail(reason: str) -> RedirectResponse:
        resp = RedirectResponse(f"{base}/login?error={reason}", status_code=302)
        resp.delete_cookie(OAUTH_COOKIE, path=OAUTH_COOKIE_PATH)
        return resp

    provider = request.app.state.google
    cookie = request.cookies.get(OAUTH_COOKIE)
    if provider is None or not cookie or not code or not state:
        return fail("oauth_failed")
    try:
        data = signer(settings.secret_key, "oauth").loads(cookie, max_age=600)
    except BadSignature:
        return fail("oauth_state")
    if not secrets.compare_digest(str(data.get("s", "")), state):
        return fail("oauth_state")
    try:
        ident = provider.exchange(code, data["v"])
    except OAuthError:
        return fail("oauth_failed")
    if not ident.email_verified:
        return fail("oauth_unverified")

    account = db.scalar(
        select(OAuthAccount).where(
            OAuthAccount.provider == "google", OAuthAccount.provider_subject == ident.subject
        )
    )
    if account:
        user = db.get(User, account.user_id)
    else:
        user = svc.get_user_by_email(db, ident.email)
        if user is None:
            user = svc.create_user(
                db, ident.email, None, ident.name or ident.email.split("@")[0], email_verified=True
            )
        elif user.email_verified_at is None:
            # Pre-hijack defence: an unverified local account may have been created by someone
            # who does not own this inbox. Drop its password and sessions before linking.
            user.password_hash = None
            user.email_verified_at = svc.now()
            svc.revoke_all_sessions(db, user.id)
        db.add(OAuthAccount(user_id=user.id, provider="google", provider_subject=ident.subject))
    if user is None or not user.is_active:
        return fail("oauth_failed")

    token = svc.create_session(db, settings, user)
    record(db, "auth.login_google", request, actor_user_id=user.id)
    db.commit()
    resp = RedirectResponse(f"{base}/dashboard", status_code=302)
    svc.set_session_cookie(resp, settings, token)
    resp.delete_cookie(OAUTH_COOKIE, path=OAUTH_COOKIE_PATH)
    return resp
