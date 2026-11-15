from datetime import timedelta

from sqlalchemy import select

from app.audit.models import AuditLog
from app.identity import service as svc
from app.identity.models import OtpChallenge, User
from tests.conftest import ORIGIN, PASSWORD, Actor


def test_register_creates_unverified_session(make_actor):
    a = make_actor("new@example.com", verified=False)
    me = a.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["user"]["email"] == "new@example.com"
    assert me.json()["user"]["email_verified"] is False
    assert me.json()["user"]["display_name"] == "Test User"


def test_session_cookie_flags(app, outbox):
    a = Actor(app, outbox, "flags@example.com")
    resp = a.register()
    cookie = resp.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie and "path=/" in cookie


def test_duplicate_email_is_case_insensitive(make_actor, app, outbox):
    make_actor("Dup@Example.com", verified=False)
    other = Actor(app, outbox, "dup@example.COM")
    assert other.register().status_code == 409


def test_weak_passwords_rejected(app, outbox):
    for pw in ("short", "1234567890123", "aaaaaaaaaaaa"):
        a = Actor(app, outbox, "weak@example.com", password=pw)
        resp = a.register()
        assert resp.status_code == 422, pw
        assert resp.json()["error"]["code"] == "WEAK_PASSWORD"


def test_login_ok_and_generic_failures(make_actor, app, outbox):
    make_actor("login@example.com")
    fresh = Actor(app, outbox, "login@example.com")
    assert fresh.login().status_code == 200
    wrong = Actor(app, outbox, "login@example.com", password="wrong-password-123")
    unknown = Actor(app, outbox, "ghost@example.com")
    r1, r2 = wrong.login(), unknown.login()
    assert r1.status_code == r2.status_code == 401
    assert r1.json()["error"]["message"] == r2.json()["error"]["message"]  # no account oracle


def test_passwords_and_otps_are_hashed_at_rest(make_actor, db):
    a = make_actor("hash@example.com", verified=False)
    code = a.code()
    user = db.scalar(select(User).where(User.email == "hash@example.com"))
    assert user.password_hash.startswith("$argon2id$")
    assert PASSWORD not in user.password_hash
    challenge = db.scalar(select(OtpChallenge))
    assert code not in challenge.code_hash and len(challenge.code_hash) == 64


# ------------------------------------------------------------ email verification
def test_unverified_user_cannot_use_patient_features(make_actor):
    a = make_actor(verified=False)
    resp = a.get("/profile")
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "EMAIL_NOT_VERIFIED"


def test_verification_unlocks_features_and_rotates_session(make_actor, app, outbox):
    a = make_actor(verified=False)
    old_cookie = a.session_cookie
    assert a.verify().status_code == 200
    assert a.session_cookie != old_cookie
    assert a.get("/profile").status_code == 200
    stale = Actor(app, outbox, "x@example.com")
    stale.client.cookies.set("mc_session", old_cookie)
    assert stale.get("/auth/me").status_code == 401  # pre-verification session is dead


def test_wrong_verification_code_rejected(make_actor):
    a = make_actor(verified=False)
    resp = a.post(
        "/auth/email/verify", json={"code": "000000" if a.code() != "000000" else "111111"}
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "INVALID_OR_EXPIRED_CODE"


def test_code_format_validated(make_actor):
    a = make_actor(verified=False)
    assert a.post("/auth/email/verify", json={"code": "12ab"}).status_code == 422


def test_otp_locks_after_max_attempts(make_actor):
    a = make_actor(verified=False)
    real = a.code()
    wrong = "000000" if real != "000000" else "111111"
    for _ in range(5):
        assert a.post("/auth/email/verify", json={"code": wrong}).status_code == 400
    # The correct code no longer works once attempts are exhausted.
    assert a.post("/auth/email/verify", json={"code": real}).status_code == 400


def test_expired_otp_rejected(make_actor, db):
    a = make_actor(verified=False)
    challenge = db.scalar(select(OtpChallenge))
    challenge.expires_at = svc.now() - timedelta(minutes=1)
    db.commit()
    assert a.verify().status_code == 400


def test_resend_invalidates_previous_code(make_actor):
    a = make_actor(verified=False)
    first = a.code()
    assert a.post("/auth/email/resend").status_code == 202
    second = a.code()
    if first != second:
        assert a.post("/auth/email/verify", json={"code": first}).status_code == 400
    assert a.post("/auth/email/verify", json={"code": second}).status_code == 200


def test_resend_cooldown(make_actor, app):
    app.state.settings.otp_resend_cooldown_seconds = 60
    a = make_actor(verified=False)
    resp = a.post("/auth/email/resend")
    assert resp.status_code == 429
    assert resp.json()["error"]["code"] == "RESEND_COOLDOWN"
    assert "retry-after" in resp.headers


# -------------------------------------------------------------------------- logout
def test_logout_invalidates_session(alice, app, outbox):
    cookie = alice.session_cookie
    assert alice.post("/auth/logout").status_code == 204
    assert alice.get("/auth/me").status_code == 401
    replay = Actor(app, outbox, "replay@example.com")
    replay.client.cookies.set("mc_session", cookie)
    assert replay.get("/auth/me").status_code == 401


def test_logout_without_session_is_harmless(app, outbox):
    assert Actor(app, outbox, "n@example.com").post("/auth/logout").status_code == 204


# ------------------------------------------------------------------ CSRF and origin
def test_csrf_required_on_authenticated_writes(alice):
    body = {"display_name": "Alice"}
    assert alice.put("/profile", json=body, csrf=False).status_code == 403
    bad = alice.put("/profile", json=body, headers={"X-CSRF-Token": "nope"}, csrf=False)
    assert bad.json()["error"]["code"] == "CSRF_INVALID"
    assert alice.put("/profile", json=body).status_code == 200


def test_csrf_token_is_bound_to_session(make_actor):
    a, b = make_actor("a1@example.com"), make_actor("b1@example.com")
    resp = a.put(
        "/profile", json={"display_name": "A"}, headers={"X-CSRF-Token": b.csrf}, csrf=False
    )
    assert resp.status_code == 403


def test_logout_enforces_csrf_for_live_session(alice):
    assert alice.post("/auth/logout", csrf=False).status_code == 403
    assert alice.get("/auth/me").status_code == 200  # still signed in


def test_cross_origin_state_change_blocked(app, outbox):
    a = Actor(app, outbox, "o@example.com")
    resp = a.client.post(
        "/api/v1/auth/login",
        json={"email": a.email, "password": a.password},
        headers={"Origin": "https://evil.example"},
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "ORIGIN_NOT_ALLOWED"
    ok = a.client.post(
        "/api/v1/auth/login",
        json={"email": a.email, "password": a.password},
        headers={"Origin": ORIGIN},
    )
    assert ok.status_code == 401  # reached the handler (account does not exist)


# --------------------------------------------------------------- password reset
def test_forgot_password_does_not_reveal_accounts(make_actor, app, outbox):
    make_actor("real@example.com")
    outbox.outbox.clear()
    a = Actor(app, outbox, "real@example.com")
    b = Actor(app, outbox, "nobody@example.com")
    r1 = a.post("/auth/password/forgot", json={"email": a.email})
    r2 = b.post("/auth/password/forgot", json={"email": b.email})
    assert r1.status_code == r2.status_code == 202
    assert r1.json() == r2.json()
    assert [m.to for m in outbox.outbox] == ["real@example.com"]


def test_password_reset_full_flow(make_actor, app, outbox):
    old = make_actor("reset@example.com")
    old_cookie = old.session_cookie
    fresh = Actor(app, outbox, "reset@example.com")
    fresh.post("/auth/password/forgot", json={"email": fresh.email})
    code = fresh.code()
    new_pw = "a-brand-new-passphrase-42"
    ok = fresh.post(
        "/auth/password/reset", json={"email": fresh.email, "code": code, "new_password": new_pw}
    )
    assert ok.status_code == 200
    # Existing sessions are revoked; the old password no longer works; the new one does.
    stale = Actor(app, outbox, "s@example.com")
    stale.client.cookies.set("mc_session", old_cookie)
    assert stale.get("/auth/me").status_code == 401
    assert fresh.login().status_code == 401
    fresh.password = new_pw
    assert fresh.login().status_code == 200
    # Single use.
    again = fresh.post(
        "/auth/password/reset",
        json={"email": fresh.email, "code": code, "new_password": "yet-another-passphrase-9"},
    )
    assert again.status_code == 400


def test_password_reset_rejects_bad_code_and_weak_password(make_actor, app, outbox):
    make_actor("r2@example.com")
    a = Actor(app, outbox, "r2@example.com")
    a.post("/auth/password/forgot", json={"email": a.email})
    code = a.code()
    wrong = "000000" if code != "000000" else "111111"
    bad = a.post(
        "/auth/password/reset",
        json={"email": a.email, "code": wrong, "new_password": "a-brand-new-passphrase-42"},
    )
    assert bad.status_code == 400
    weak = a.post(
        "/auth/password/reset", json={"email": a.email, "code": code, "new_password": "short"}
    )
    assert weak.status_code == 422
    # A weak-password attempt must not burn the valid code.
    ok = a.post(
        "/auth/password/reset",
        json={"email": a.email, "code": code, "new_password": "a-brand-new-passphrase-42"},
    )
    assert ok.status_code == 200


def test_reset_for_unknown_email_is_indistinguishable(app, outbox):
    a = Actor(app, outbox, "ghost@example.com")
    resp = a.post(
        "/auth/password/reset",
        json={"email": a.email, "code": "123456", "new_password": "a-brand-new-passphrase-42"},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "INVALID_OR_EXPIRED_CODE"


# ------------------------------------------------------------------- rate limiting
def test_login_rate_limited_per_email(app, outbox):
    app.state.settings.rate_limit_enabled = True
    a = Actor(app, outbox, "victim@example.com", password="wrong-password-123")
    codes = [a.login().status_code for _ in range(12)]
    assert codes[:10] == [401] * 10
    assert codes[10] == 429
    assert a.login().headers["retry-after"].isdigit()


def test_forgot_password_rate_limited(app, outbox):
    app.state.settings.rate_limit_enabled = True
    a = Actor(app, outbox, "spam@example.com")
    codes = [a.post("/auth/password/forgot", json={"email": a.email}).status_code for _ in range(5)]
    assert codes == [202, 202, 202, 429, 429]


def test_registration_rate_limited(app, outbox):
    app.state.settings.rate_limit_enabled = True
    codes = [Actor(app, outbox, f"r{i}@example.com").register().status_code for i in range(12)]
    assert codes[:10] == [201] * 10 and codes[10] == 429


# --------------------------------------------------------------------------- audit
def test_auth_events_are_audited_without_secrets(make_actor, app, outbox, db):
    make_actor("audit@example.com")
    Actor(app, outbox, "audit@example.com", password="wrong-password-123").login()
    rows = db.scalars(select(AuditLog)).all()
    actions = {r.action for r in rows}
    assert {"auth.register", "auth.email_verified", "auth.login_failed"} <= actions
    dump = " ".join(f"{r.action} {r.event_metadata} {r.resource_id}" for r in rows)
    assert PASSWORD not in dump and "wrong-password" not in dump
