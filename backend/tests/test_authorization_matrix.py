"""Release-blocking authorization sweep over EVERY route the application exposes.

Instead of listing endpoints by hand (and forgetting the next one), the routes are read from the
running app, so a new endpoint is covered automatically and fails here until it is classified:

* anonymous callers get 401 on everything except an explicit, reviewed PUBLIC allowlist;
* a signed-in patient gets 403 on every /admin route;
* a signed-in patient without a CSRF token gets 403 on every state-changing route;
* a random identifier never yields data or a server error (no 200, no 5xx).

Cross-user reads/writes on real data are covered per resource in test_ownership.py and the
per-feature test files; this file proves nothing is reachable by the wrong kind of caller.
"""

import uuid

import pytest

API = "/api/v1"
UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}

# (method, path template). Everything here is deliberately reachable without a session; each
# entry is either an auth flow, a recipient flow protected by its own token + one-time code, or
# a static fact. Adding an endpoint here is a security decision: review it.
PUBLIC = {
    ("POST", "/auth/register"),
    ("POST", "/auth/login"),
    ("POST", "/auth/password/forgot"),
    ("POST", "/auth/password/reset"),
    ("GET", "/auth/google/start"),
    ("GET", "/auth/google/callback"),
    ("POST", "/share-access/start"),
    ("POST", "/share-access/verify"),
    ("GET", "/share-access/summary"),
    ("GET", "/emergency/status"),
    ("GET", "/auth/providers"),  # static: which sign-in methods are configured
    ("POST", "/auth/logout"),  # idempotent: signing out when already signed out is a no-op
}


def _routes(app):
    """(METHOD, path-below-/api/v1) for every operation, read from the generated OpenAPI
    document so nested routers cannot hide an endpoint from the sweep."""
    out = []
    for path, ops in app.openapi()["paths"].items():
        if path.startswith(API):
            for method in ops:
                if method.upper() in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
                    out.append((method.upper(), path[len(API) :]))
    return sorted(out)


def _fill(path: str) -> str:
    out = path
    while "{" in out:
        start, end = out.index("{"), out.index("}")
        out = out[:start] + str(uuid.uuid4()) + out[end + 1 :]
    return out


def test_route_inventory_is_not_empty(app):
    routes = _routes(app)
    assert len(routes) > 130
    assert len({p for _, p in routes if p.startswith("/admin")}) >= 25


def test_every_route_requires_a_session_unless_explicitly_public(app, make_actor):
    anon = make_actor("anon-probe@example.com")  # its cookie jar is replaced by a fresh client
    anon.client.cookies.clear()
    anon.csrf = None
    leaks, checked = [], 0
    for method, path in _routes(app):
        if (method, path) in PUBLIC:
            continue
        checked += 1
        resp = anon.request(method, _fill(path), csrf=False, json={} if method in UNSAFE else None)
        if resp.status_code != 401:
            leaks.append((method, path, resp.status_code))
    assert checked > 100 and not leaks, f"reachable without a session: {leaks}"


def test_public_allowlist_has_no_stale_entries(app):
    existing = set(_routes(app))
    assert PUBLIC <= existing, f"not real routes any more: {PUBLIC - existing}"


def test_patient_gets_403_on_every_admin_route(app, alice):
    wrong, checked = [], 0
    for method, path in _routes(app):
        if not path.startswith("/admin"):
            continue
        checked += 1
        resp = alice.request(method, _fill(path), json={} if method in UNSAFE else None)
        if resp.status_code != 403:
            wrong.append((method, path, resp.status_code))
    assert checked >= 25 and not wrong, f"a patient can reach admin routes: {wrong}"


def test_state_changing_routes_reject_a_missing_csrf_token(app, alice):
    missing, checked = [], 0
    for method, path in _routes(app):
        if method not in UNSAFE or (method, path) in PUBLIC or path.startswith("/admin"):
            continue
        checked += 1
        # Logout and email verification sit behind a session but not email verification.
        resp = alice.request(method, _fill(path), csrf=False, json={})
        if resp.status_code != 403 or resp.json()["error"]["code"] != "CSRF_INVALID":
            missing.append((method, path, resp.status_code))
    assert checked > 50 and not missing, (
        f"state change without CSRF token accepted/mis-reported: {missing}"
    )


def test_admin_state_changes_also_require_csrf(app, make_actor, db):
    from sqlalchemy import update

    from app.identity.models import User

    boss = make_actor("csrf-boss@example.com")
    db.execute(update(User).where(User.email == boss.email).values(role="admin"))
    db.commit()
    bad, checked = [], 0
    for method, path in _routes(app):
        if method in UNSAFE and path.startswith("/admin"):
            checked += 1
            resp = boss.request(method, _fill(path), csrf=False, json={})
            if resp.status_code != 403 or resp.json()["error"]["code"] != "CSRF_INVALID":
                bad.append((method, path, resp.status_code))
    assert checked >= 15 and not bad, bad


def test_random_identifiers_never_return_data_or_crash(app, alice):
    """A patient guessing identifiers must get a refusal or 'not found', never 200 or a 5xx."""
    bad, checked = [], 0
    for method, path in _routes(app):
        if "{" not in path or path.startswith(("/admin", "/share-access")):
            continue
        if (method, path) in PUBLIC:
            continue
        checked += 1
        resp = alice.request(method, _fill(path), json={} if method in UNSAFE else None)
        if resp.status_code >= 500 or resp.status_code == 200 or resp.status_code == 201:
            bad.append((method, path, resp.status_code))
    assert checked > 40 and not bad, f"unexpected success or server error for random ids: {bad}"


def test_admin_routes_do_not_expose_secrets_or_health_content(app, make_actor, db):
    """The admin API's user listing carries account metadata only."""
    from sqlalchemy import update

    from app.identity.models import User

    boss = make_actor("shape-boss@example.com")
    db.execute(update(User).where(User.email == boss.email).values(role="admin"))
    db.commit()
    victim = make_actor("victim@example.com")
    victim.post("/conditions", json={"display_name": "Type 2 diabetes"})
    blob = (boss.get("/admin/users").text + boss.get("/admin/audit-logs?limit=100").text).lower()
    for needle in ("password", "argon2", "type 2 diabetes", "csrf", "session_token"):
        assert needle not in blob, needle


@pytest.mark.parametrize("path", ["/health/live", "/health/ready"])
def test_health_endpoints_reveal_nothing(app, path):
    from fastapi.testclient import TestClient

    resp = TestClient(app).get(path)
    assert resp.status_code == 200 and resp.json() == {"status": "ok"}
