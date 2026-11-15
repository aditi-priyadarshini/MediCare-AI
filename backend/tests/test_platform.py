import json

import pytest
from pydantic import ValidationError

from app.core.config import DEV_SECRET, Settings
from tests.conftest import PASSWORD, Actor


def test_health_endpoints(app, outbox):
    a = Actor(app, outbox, "h@example.com")
    assert a.client.get("/health/live").json() == {"status": "ok"}
    assert a.client.get("/health/ready").json() == {"status": "ok"}


def test_error_envelope_and_request_id(app, outbox):
    a = Actor(app, outbox, "e@example.com")
    resp = a.client.get("/api/v1/nope", headers={"X-Request-ID": "trace-abcdef123456"})
    err = resp.json()["error"]
    assert resp.status_code == 404 and err["code"] == "RESOURCE_NOT_FOUND"
    assert err["request_id"] == "trace-abcdef123456" == resp.headers["x-request-id"]


def test_unsafe_request_id_is_replaced(app, outbox):
    a = Actor(app, outbox, "e@example.com")
    resp = a.client.get("/health/live", headers={"X-Request-ID": "bad id\r\nX-Evil: 1"})
    assert resp.headers["x-request-id"] != "bad id" and len(resp.headers["x-request-id"]) == 32


def test_security_headers(app, outbox):
    resp = Actor(app, outbox, "s@example.com").client.get("/health/live")
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert resp.headers["cache-control"] == "no-store"
    assert "default-src 'none'" in resp.headers["content-security-policy"]


def test_validation_errors_never_echo_submitted_values(app, outbox):
    a = Actor(app, outbox, "v@example.com")
    resp = a.post(
        "/auth/register", json={"email": "not-an-email", "password": PASSWORD, "display_name": "X"}
    )
    assert resp.status_code == 422 and resp.json()["error"]["code"] == "VALIDATION_ERROR"
    assert PASSWORD not in resp.text and "not-an-email" not in resp.text


def test_sensitive_data_is_never_logged(make_actor, app, outbox, log_capture):
    secret_name = "Zebediah Quillfeather"
    secret_cond = "Extremely Rare Syndrome"
    a = make_actor("logcheck@example.com", verified=False)
    code = a.code()
    a.verify()
    a.put("/profile", json={"display_name": secret_name})
    a.post("/conditions", json={"display_name": secret_cond})
    Actor(app, outbox, "logcheck@example.com", password="wrong-password-xyz").login()
    a.post("/auth/password/forgot", json={"email": a.email})
    reset_code = a.code()
    logged = "\n".join(
        json.dumps(
            {
                "m": r.getMessage(),
                **{k: str(v) for k, v in r.__dict__.items() if k in ("path", "event")},
            }
        )
        for r in log_capture
    )
    assert logged, "expected request logs to have been captured"
    for needle in (
        PASSWORD,
        "wrong-password-xyz",
        code,
        reset_code,
        secret_name,
        secret_cond,
        "logcheck@example.com",
        a.session_cookie or "none",
        a.csrf or "none",
    ):
        assert needle not in logged, f"{needle!r} leaked into logs"


def test_request_log_uses_route_template_not_raw_url(alice, log_capture):
    alice.get("/conditions?limit=3")
    paths = [getattr(r, "path", None) for r in log_capture if getattr(r, "path", None)]
    assert "/api/v1/conditions" in paths and not any("limit" in p for p in paths)


def test_production_refuses_unsafe_config():
    with pytest.raises(ValidationError):
        Settings(environment="production", secret_key=DEV_SECRET, cookie_secure=True)
    with pytest.raises(ValidationError):
        Settings(environment="production", secret_key="x" * 40, cookie_secure=False)
    with pytest.raises(ValidationError):
        Settings(
            environment="production",
            secret_key="x" * 40,
            cookie_secure=True,
            email_backend="memory",
        )
    with pytest.raises(ValidationError):
        Settings(secret_key="short")
    Settings(
        environment="production", secret_key="x" * 40, cookie_secure=True, email_backend="smtp"
    )
