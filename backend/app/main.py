import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.deps import SAFE_METHODS
from app.api.v1 import api_v1
from app.core.config import Settings, get_settings
from app.core.db import make_engine, make_sessionmaker
from app.core.errors import error_body, install_error_handlers
from app.core.logging import configure_logging, request_id_ctx
from app.core.ratelimit import InMemoryRateLimiter
from app.identity.providers import (
    EmailProvider,
    GoogleOAuthProvider,
    HttpGoogleOAuthProvider,
    MemoryEmailProvider,
    SmtpEmailProvider,
)
from app.identity.service import safe_request_id
from app.safety.authenticity import AuthenticityVerifier, UnsupportedVerifier

log = logging.getLogger("app.request")

API_CSP = "default-src 'none'; frame-ancestors 'none'"
API_PREFIX = "/api/v1"


def _route_template(request: Request) -> str:
    """Matched route template (never the raw URL, which can carry query data)."""
    route = request.scope.get("route")
    path = getattr(route, "path", None)
    if path is None:
        return "unmatched"
    # Nested routers may report the path relative to their mount point.
    if request.url.path.startswith(API_PREFIX) and not path.startswith(API_PREFIX):
        return API_PREFIX + path
    return path


def create_app(
    settings: Settings | None = None,
    email: EmailProvider | None = None,
    google: GoogleOAuthProvider | None = None,
    authenticity: AuthenticityVerifier | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)
    app = FastAPI(
        title="MediCare AI API",
        version="0.1.0",
        docs_url=None if settings.environment == "production" else "/docs",
        redoc_url=None,
        openapi_url=None if settings.environment == "production" else "/openapi.json",
    )

    engine = make_engine(settings.database_url)
    app.state.settings = settings
    app.state.engine = engine
    app.state.sessionmaker = make_sessionmaker(engine)
    app.state.limiter = InMemoryRateLimiter()
    app.state.email = email or (
        MemoryEmailProvider()
        if settings.email_backend == "memory"
        else SmtpEmailProvider(settings.smtp_host, settings.smtp_port, settings.smtp_from)
    )
    app.state.google = google or (
        HttpGoogleOAuthProvider(
            settings.google_client_id, settings.google_client_secret, settings.google_redirect_uri
        )
        if settings.google_enabled
        else None
    )

    # No authoritative source is integrated yet: the default always says "unable to verify".
    app.state.authenticity = authenticity or UnsupportedVerifier()

    install_error_handlers(app)

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        rid = safe_request_id(request.headers.get("x-request-id")) or uuid.uuid4().hex
        request.state.request_id = rid
        token = request_id_ctx.set(rid)
        started = time.perf_counter()
        try:
            # Cookie-session CSRF defence in depth: reject cross-origin state changes outright.
            origin = request.headers.get("origin")
            if (
                request.method not in SAFE_METHODS
                and origin is not None
                and origin.rstrip("/") not in settings.allowed_origins
            ):
                response = JSONResponse(
                    error_body(request, "ORIGIN_NOT_ALLOWED", "Cross-origin request blocked."),
                    status_code=403,
                )
            else:
                response = await call_next(request)
            response.headers["X-Request-ID"] = rid
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["Referrer-Policy"] = "no-referrer"
            response.headers["Cache-Control"] = "no-store"
            if not request.url.path.startswith(("/docs", "/openapi")):
                response.headers["Content-Security-Policy"] = API_CSP
            log.info(
                "request",
                extra={
                    "method": request.method,
                    "path": _route_template(request),
                    "status": response.status_code,
                    "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                },
            )
            return response
        finally:
            request_id_ctx.reset(token)

    @app.get("/health/live", tags=["health"])
    def live():
        return {"status": "ok"}

    @app.get("/health/ready", tags=["health"])
    def ready():
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
        except Exception:
            return JSONResponse({"status": "unavailable"}, status_code=503)
        return {"status": "ok"}

    app.include_router(api_v1)
    return app


def app_factory() -> FastAPI:
    """Uvicorn entrypoint: `uvicorn app.main:app_factory --factory`."""
    return create_app()
