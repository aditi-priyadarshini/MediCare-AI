"""Test harness: real PostgreSQL (CITEXT, JSONB), schema built by running the Alembic migration."""

import base64
import hashlib
import logging
import os
import re

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from alembic import command
from app.core.config import Settings
from app.identity.providers import GoogleIdentity, MemoryEmailProvider
from app.main import create_app
from app.models import Base

TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://medicare:medicare@localhost:5432/medicare_test"
)
ORIGIN = "http://localhost:3000"
PASSWORD = "correct-horse-battery-staple"


@pytest.fixture(scope="session", autouse=True)
def _migrated_database():
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", TEST_DB_URL)
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield


@pytest.fixture(autouse=True)
def _clean_tables():
    engine = create_engine(TEST_DB_URL)
    names = ", ".join(t.name for t in Base.metadata.sorted_tables)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {names} RESTART IDENTITY CASCADE"))
    engine.dispose()
    yield


class FakeGoogle:
    """Verifies the PKCE challenge like Google would, then returns a canned identity."""

    def __init__(self):
        self.identity = GoogleIdentity("g-123", "google.user@example.com", True, "Google User")
        self._challenge = None

    def authorization_url(self, state: str, code_challenge: str) -> str:
        self._challenge = code_challenge
        return f"https://accounts.example/auth?state={state}"

    def exchange(self, code: str, code_verifier: str) -> GoogleIdentity:
        digest = base64.urlsafe_b64encode(hashlib.sha256(code_verifier.encode()).digest())
        assert digest.rstrip(b"=").decode() == self._challenge, "PKCE verifier mismatch"
        return self.identity


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(
        storage_dir=str(tmp_path / "files"),
        max_upload_bytes=1024,
        environment="test",
        database_url=TEST_DB_URL,
        email_backend="memory",
        rate_limit_enabled=False,
        otp_resend_cooldown_seconds=0,
    )


@pytest.fixture
def outbox() -> MemoryEmailProvider:
    return MemoryEmailProvider()


@pytest.fixture
def google() -> FakeGoogle:
    return FakeGoogle()


@pytest.fixture
def app(settings, outbox, google):
    application = create_app(settings, email=outbox, google=google)
    yield application
    application.state.engine.dispose()


class Actor:
    """A browser: its own cookie jar plus automatic CSRF header handling."""

    def __init__(self, app, outbox, email: str, password: str = PASSWORD):
        self.app, self.outbox, self.email, self.password = app, outbox, email, password
        self.client = TestClient(app, headers={"Origin": ORIGIN})
        self.csrf: str | None = None

    def request(self, method: str, url: str, csrf: bool = True, **kwargs):
        headers = dict(kwargs.pop("headers", {}))
        if csrf and self.csrf and method.upper() not in ("GET", "HEAD"):
            headers.setdefault("X-CSRF-Token", self.csrf)
        resp = self.client.request(method, f"/api/v1{url}", headers=headers, **kwargs)
        if (
            resp.status_code < 300
            and resp.content
            and resp.headers.get("content-type", "").startswith("application/json")
        ):
            body = resp.json()
            if isinstance(body, dict) and "csrf_token" in body:
                self.csrf = body["csrf_token"]
        return resp

    def get(self, url, **kw):
        return self.request("GET", url, **kw)

    def post(self, url, **kw):
        return self.request("POST", url, **kw)

    def put(self, url, **kw):
        return self.request("PUT", url, **kw)

    def patch(self, url, **kw):
        return self.request("PATCH", url, **kw)

    def delete(self, url, **kw):
        return self.request("DELETE", url, **kw)

    def code(self, purpose_word: str = "code") -> str:
        mails = [m for m in self.outbox.outbox if m.to == self.email.lower()]
        assert mails, f"no email sent to {self.email}"
        return re.search(r"\b(\d{6})\b", mails[-1].body).group(1)

    def register(self, name: str = "Test User"):
        return self.post(
            "/auth/register",
            json={"email": self.email, "password": self.password, "display_name": name},
        )

    def login(self):
        return self.post("/auth/login", json={"email": self.email, "password": self.password})

    def verify(self):
        return self.post("/auth/email/verify", json={"code": self.code()})

    @property
    def session_cookie(self) -> str | None:
        return self.client.cookies.get("mc_session")


@pytest.fixture
def make_actor(app, outbox):
    counter = {"n": 0}

    def factory(email: str | None = None, verified: bool = True) -> Actor:
        counter["n"] += 1
        actor = Actor(app, outbox, email or f"user{counter['n']}@example.com")
        assert actor.register().status_code == 201
        if verified:
            assert actor.verify().status_code == 200
        return actor

    return factory


@pytest.fixture
def alice(make_actor):
    return make_actor("alice@example.com")


@pytest.fixture
def bob(make_actor):
    return make_actor("bob@example.com")


@pytest.fixture
def db(app):
    with app.state.sessionmaker() as session:
        yield session


@pytest.fixture
def log_capture(app):
    """Attach after create_app, which installs the JSON handler on the root logger."""
    records: list[logging.LogRecord] = []

    class _H(logging.Handler):
        def emit(self, record):
            records.append(record)

    handler = _H(level=logging.DEBUG)
    root = logging.getLogger()
    root.addHandler(handler)
    yield records
    root.removeHandler(handler)
