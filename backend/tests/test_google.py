from urllib.parse import parse_qs, urlparse

from sqlalchemy import select

from app.core.config import Settings
from app.identity.models import OAuthAccount, User
from app.main import create_app
from tests.conftest import TEST_DB_URL, Actor


def _begin(actor):
    start = actor.client.get("/api/v1/auth/google/start", follow_redirects=False)
    assert start.status_code == 302
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    return state


def _callback(actor, state, code="abc"):
    return actor.client.get(
        f"/api/v1/auth/google/callback?code={code}&state={state}", follow_redirects=False
    )


def test_start_reports_unavailable_when_not_configured(outbox):
    app = create_app(
        Settings(environment="test", database_url=TEST_DB_URL, email_backend="memory"), email=outbox
    )
    from fastapi.testclient import TestClient

    resp = TestClient(app).get("/api/v1/auth/google/start", follow_redirects=False)
    assert resp.status_code == 503 and resp.json()["error"]["code"] == "PROVIDER_UNAVAILABLE"
    app.state.engine.dispose()


def test_new_google_user_is_created_verified_and_signed_in(app, outbox, db):
    a = Actor(app, outbox, "g@example.com")
    resp = _callback(a, _begin(a))
    assert resp.status_code == 302 and resp.headers["location"].endswith("/dashboard")
    me = a.get("/auth/me").json()["user"]
    assert me["email"] == "google.user@example.com" and me["email_verified"] is True
    assert a.get("/profile").status_code == 200  # verified, so patient features work immediately
    user = db.scalar(select(User))
    assert user.password_hash is None
    assert db.scalar(select(OAuthAccount)).provider_subject == "g-123"


def test_state_mismatch_rejected(app, outbox):
    a = Actor(app, outbox, "g@example.com")
    _begin(a)
    resp = _callback(a, "forged-state")
    assert resp.status_code == 302 and "error=oauth_state" in resp.headers["location"]
    assert a.get("/auth/me").status_code == 401


def test_callback_without_started_flow_rejected(app, outbox):
    a = Actor(app, outbox, "g@example.com")
    resp = _callback(a, "whatever")
    assert "error=oauth_failed" in resp.headers["location"]


def test_unverified_google_email_rejected(app, outbox, google):
    google.identity.email_verified = False
    a = Actor(app, outbox, "g@example.com")
    assert "error=oauth_unverified" in _callback(a, _begin(a)).headers["location"]


def test_returning_google_user_reuses_account(app, outbox, db):
    for _ in range(2):
        a = Actor(app, outbox, "g@example.com")
        _callback(a, _begin(a))
    assert len(db.scalars(select(User)).all()) == 1


def test_links_to_existing_verified_password_account(make_actor, app, outbox, db, google):
    make_actor("google.user@example.com")
    g = Actor(app, outbox, "g@example.com")
    _callback(g, _begin(g))
    assert len(db.scalars(select(User)).all()) == 1
    assert db.scalar(select(OAuthAccount)) is not None


def test_pre_registered_unverified_account_is_neutralised(make_actor, app, outbox, db):
    """An attacker pre-registers the victim's email; Google sign-in must not hand it over."""
    attacker = make_actor("google.user@example.com", verified=False)
    stale_cookie = attacker.session_cookie
    victim = Actor(app, outbox, "v@example.com")
    _callback(victim, _begin(victim))
    user = db.scalar(select(User).where(User.email == "google.user@example.com"))
    assert user.password_hash is None  # attacker's password is gone
    probe = Actor(app, outbox, "p@example.com")
    probe.client.cookies.set("mc_session", stale_cookie)
    assert probe.get("/auth/me").status_code == 401  # attacker's session is revoked
    assert attacker.login().status_code == 401


def test_providers_endpoint_reflects_configuration(app, outbox):
    a = Actor(app, outbox, "p@example.com")
    assert a.get("/auth/providers").json() == {"google": False}
    app.state.settings.google_client_id = "id"
    app.state.settings.google_client_secret = "secret"  # noqa: S105
    assert a.get("/auth/providers").json() == {"google": True}
