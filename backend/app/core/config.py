"""Application settings, validated at startup (fail fast on unsafe configuration)."""

from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_SECRET = "dev-only-insecure-secret-change-me-0123456789"  # noqa: S105 - dev default, rejected in production


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"
    database_url: str = "postgresql+psycopg://medicare:medicare@localhost:5432/medicare"
    secret_key: str = DEV_SECRET

    # Comma-separated list of browser origins allowed to make state-changing requests.
    frontend_origins: str = "http://localhost:3000"

    # Sessions / cookies
    session_ttl_hours: int = 168
    cookie_secure: bool = False
    cookie_samesite: Literal["lax", "strict"] = "lax"
    session_cookie_name: str = "mc_session"

    # Email verification / OTP
    require_email_verification: bool = True
    otp_ttl_minutes: int = 10
    otp_max_attempts: int = 5
    otp_resend_cooldown_seconds: int = 60

    # Email delivery
    email_backend: Literal["smtp", "memory"] = "smtp"
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_from: str = "MediCare AI <no-reply@medicare.local>"

    # Google OAuth (optional; the endpoints report "unavailable" when unset)
    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str = "http://localhost:3000/api/v1/auth/google/callback"

    rate_limit_enabled: bool = True

    # Uploaded records (PDF / PNG / JPEG)
    storage_dir: str = "./storage"
    max_upload_bytes: int = 10 * 1024 * 1024

    # Reminder worker (python -m app.scripts.run_worker)
    worker_interval_seconds: int = 60

    # AI assistant (Phase 5). "none" = no model: the assistant lists the matching records
    # itself ("evidence only"). Only structured, de-identified evidence is ever sent out.
    llm_provider: Literal["none", "anthropic"] = "none"
    llm_api_key: str | None = None
    llm_model: str = "claude-sonnet-5-5"
    llm_timeout_seconds: int = 30
    llm_max_output_tokens: int = 700
    assistant_requests_per_minute: int = 20

    @property
    def allowed_origins(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.frontend_origins.split(",") if o.strip()]

    @property
    def frontend_base_url(self) -> str:
        return self.allowed_origins[0]

    @property
    def google_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    @model_validator(mode="after")
    def _check_safety(self) -> "Settings":
        if len(self.secret_key) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters")
        if self.environment == "production":
            if self.secret_key == DEV_SECRET:
                raise ValueError("SECRET_KEY must be changed in production")
            if not self.cookie_secure:
                raise ValueError("COOKIE_SECURE must be true in production")
            if self.email_backend == "memory":
                raise ValueError("EMAIL_BACKEND=memory is not allowed in production")
        if self.llm_provider == "anthropic" and not self.llm_api_key:
            raise ValueError("LLM_API_KEY is required when LLM_PROVIDER=anthropic")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
