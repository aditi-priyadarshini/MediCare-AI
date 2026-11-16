"""Phase 9 release checks: demo data, security headers, configuration guards, repository hygiene."""

import re
import subprocess
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.config import Settings, get_settings
from app.identity.models import User
from app.records.models import LabResult
from tests.conftest import TEST_DB_URL

ROOT = Path(__file__).resolve().parents[2]


# ------------------------------------------------------------------------- demo data
@pytest.fixture
def demo_env(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", TEST_DB_URL)
    monkeypatch.setenv("EMAIL_BACKEND", "memory")
    monkeypatch.setenv("RATE_LIMIT_ENABLED", "false")
    monkeypatch.setenv("STORAGE_DIR", str(tmp_path))
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("DEMO_PASSWORD", "correct-horse-battery-staple")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_seed_demo_creates_synthetic_data_through_the_api(demo_env, db, capsys):
    from app.scripts import seed_demo

    assert seed_demo.main() == 0
    out = capsys.readouterr().out
    assert "correct-horse" not in out  # the password is never printed
    emails = set(db.scalars(select(User.email)))
    assert emails == {seed_demo.PATIENT_EMAIL, seed_demo.ADMIN_EMAIL, seed_demo.REVIEWER_EMAIL}
    assert all(e.endswith("@example.com") for e in emails)
    labs = db.scalars(select(LabResult).order_by(LabResult.observed_on)).all()
    assert [float(x.value_numeric) for x in labs] == [8.4, 8.0, 7.6, 7.1]
    assert {x.verification_status for x in labs} == {"patient_reported"}  # never "confirmed"
    # Running it again changes nothing.
    assert seed_demo.main() == 0
    assert len(db.scalars(select(LabResult)).all()) == 4
    assert {u.role for u in db.scalars(select(User))} == {"patient", "admin"}
    # All three accounts finished onboarding, so each opens on its dashboard.
    from app.patients import service as patients

    assert all(patients.onboarding_completed(db, u.id) for u in db.scalars(select(User)))
    from app.patients.models import PatientAllergy, PatientCondition

    assert db.scalars(select(PatientCondition)).all() and db.scalars(select(PatientAllergy)).all()


def test_seed_demo_refuses_production_and_missing_password(demo_env, monkeypatch, db, capsys):
    from app.scripts import seed_demo

    monkeypatch.delenv("DEMO_PASSWORD")
    assert seed_demo.main() == 1
    monkeypatch.setenv("DEMO_PASSWORD", "correct-horse-battery-staple")
    for key, value in {
        "ENVIRONMENT": "production",
        "SECRET_KEY": "z" * 48,
        "COOKIE_SECURE": "true",
        "EMAIL_BACKEND": "smtp",
        "FRONTEND_ORIGINS": "https://app.example.com",
    }.items():
        monkeypatch.setenv(key, value)
    get_settings.cache_clear()
    assert seed_demo.main() == 1
    assert db.scalars(select(User)).all() == []


# -------------------------------------------------------------------- response headers
def test_api_responses_carry_security_headers(alice):
    resp = alice.get("/auth/me")
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert resp.headers["referrer-policy"] == "no-referrer"
    assert resp.headers["cache-control"] == "no-store"
    assert "default-src 'none'" in resp.headers["content-security-policy"]
    assert "frame-ancestors 'none'" in resp.headers["content-security-policy"]


def test_hsts_only_when_cookies_are_secure(app, settings):
    from fastapi.testclient import TestClient

    from app.main import create_app

    plain = TestClient(app).get("/health/live")
    assert "strict-transport-security" not in plain.headers
    secure = create_app(settings.model_copy(update={"cookie_secure": True}))
    resp = TestClient(secure).get("/health/live")
    assert "max-age=" in resp.headers["strict-transport-security"]
    secure.state.engine.dispose()


def test_session_cookie_flags(app, outbox):
    from tests.conftest import Actor

    a = Actor(app, outbox, "cookie@example.com")
    resp = a.register()
    cookie = resp.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie and "path=/" in cookie


def test_cross_origin_state_change_is_blocked(alice):
    resp = alice.post(
        "/feedback", json={"message": "hello hello"}, headers={"Origin": "https://evil.example"}
    )
    assert resp.status_code == 403 and resp.json()["error"]["code"] == "ORIGIN_NOT_ALLOWED"


def test_openapi_and_docs_are_off_in_production():
    from fastapi.testclient import TestClient

    from app.main import create_app

    prod = Settings(
        environment="production",
        secret_key="x" * 48,
        cookie_secure=True,
        email_backend="smtp",
        database_url=TEST_DB_URL,
        frontend_origins="https://app.example.com",
    )
    app = create_app(prod)
    c = TestClient(app)
    assert c.get("/openapi.json").status_code == 404 and c.get("/docs").status_code == 404
    app.state.engine.dispose()


def test_production_refuses_unsafe_configuration():
    base = dict(
        environment="production", database_url=TEST_DB_URL, frontend_origins="https://a.example"
    )
    for bad in (
        {},  # dev secret, insecure cookie, memory/smtp defaults
        {"secret_key": "short"},
        {"secret_key": "y" * 48, "cookie_secure": False},
        {"secret_key": "y" * 48, "cookie_secure": True, "email_backend": "memory"},
    ):
        with pytest.raises(ValueError):
            Settings(**{**base, **bad})


# ------------------------------------------------------------------ repository hygiene
SECRET_PATTERNS = {
    "private key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"),
    "AWS access key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "GitHub token": re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"),
    "Anthropic/OpenAI-style key": re.compile(r"\bsk-(?:ant-)?[A-Za-z0-9_-]{24,}\b"),
    "Google OAuth secret": re.compile(r"\bGOCSPX-[A-Za-z0-9_-]{20,}\b"),
    "Slack token": re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}\b"),
}
SKIP_DIRS = {
    ".git",
    "node_modules",
    ".next",
    "__pycache__",
    ".ruff_cache",
    ".pytest_cache",
    "storage",
}
TEXT_SUFFIXES = {
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".mjs",
    ".json",
    ".yml",
    ".yaml",
    ".md",
    ".sh",
    ".ini",
    ".toml",
    ".txt",
    ".css",
    ".example",
    ".cfg",
    ".conf",
    "",
}


def _repo_files():
    for path in ROOT.rglob("*"):
        if path.is_file() and not (set(path.relative_to(ROOT).parts) & SKIP_DIRS):
            if path.suffix in TEXT_SUFFIXES and path.name != "package-lock.json":
                yield path


def test_no_secrets_in_repository():
    hits = []
    scanned = 0
    for path in _repo_files():
        try:
            text = path.read_text(errors="ignore")
        except OSError:
            continue
        scanned += 1
        for label, pattern in SECRET_PATTERNS.items():
            if pattern.search(text):
                hits.append((label, str(path.relative_to(ROOT))))
    assert scanned > 200
    assert not hits, f"possible secrets committed: {hits}"


def test_no_real_env_files_and_examples_hold_placeholders_only():
    for p in ROOT.rglob(".env*"):
        if SKIP_DIRS & set(p.relative_to(ROOT).parts):
            continue
        assert p.name.endswith(".example"), f"{p.relative_to(ROOT)} must not be committed"
    for p in ROOT.rglob(".env.example"):
        for line in p.read_text().splitlines():
            key, _, value = line.partition("=")
            if re.search(r"(PASSWORD|SECRET|KEY|TOKEN)", key) and value.strip():
                assert re.search(r"change|example|placeholder|dev|your|^$", value, re.I), (
                    f"{p.relative_to(ROOT)}: {key} looks like a real value"
                )


def test_gitignore_excludes_env_and_storage():
    text = (ROOT / ".gitignore").read_text()
    assert ".env" in text and "storage" in text


def test_demo_and_seed_data_are_synthetic_labelled():
    migration = (ROOT / "backend/alembic/versions/0006_discovery_and_diet.py").read_text()
    assert "(demo)" in migration
    for p in (ROOT / "backend/app/scripts/seed_demo.py",):
        text = p.read_text()
        assert "example.com" in text and "SYNTHETIC" in text


def test_git_has_no_tracked_env_file_if_repo_is_a_git_checkout():
    if not (ROOT / ".git").exists():
        pytest.skip("not a git checkout")
    out = subprocess.run(  # noqa: S603
        ["git", "ls-files"],  # noqa: S607
        cwd=ROOT,
        capture_output=True,
        text=True,
    ).stdout
    assert not [f for f in out.splitlines() if re.search(r"(^|/)\.env$", f)]
