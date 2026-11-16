"""Phase 8 sharing: consent to share, recipient verification, scope, revocation, expiry, logging.

The recipient is a separate, cookie-less browser (`visitor`); the patient is `alice`.
"""

import re
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.audit.models import AuditLog
from app.core.config import Settings
from app.main import create_app
from app.sharing.models import ShareAccessLog, ShareGrant
from tests.conftest import Actor

RECIPIENT = "dr.rao@example.com"
SHARE = {
    "recipient_name": "Dr Rao",
    "recipient_email": RECIPIENT,
    "categories": ["conditions", "labs"],
    "date_from": "2026-01-01",
    "expires_in_hours": 24,
    "confirm": True,
}
PROFILE = {"display_name": "Alice Das", "blood_group": "O+", "timezone": "Asia/Kolkata"}
HB = {
    "test_name": "Hemoglobin",
    "value_numeric": 11.2,
    "unit": "g/dL",
    "ref_low": 12.0,
    "ref_high": 15.5,
    "observed_on": "2026-11-01",
}
OLD_HB = {**HB, "value_numeric": 13.0, "observed_on": "2025-02-01"}
SECRET_NOTE = "private-note-xyz"


def seed(alice) -> dict:
    assert alice.put("/profile", json=PROFILE).status_code == 200
    assert alice.post("/conditions", json={"display_name": "Type 2 diabetes"}).status_code == 201
    allergy = alice.post(
        "/allergies", json={"substance": "Penicillin", "severity": "severe"}
    ).json()
    med = {"display_name": "Metformin", "dose_text": "500 mg"}
    assert alice.post("/medications", json=med).status_code == 201
    assert alice.post("/labs", json=HB).status_code == 201
    assert alice.post("/labs", json=OLD_HB).status_code == 201
    assert (
        alice.post(
            "/records",
            json={
                "record_type": "lab_report",
                "title": "CBC Nov",
                "record_date": "2026-11-01",
                "notes": SECRET_NOTE,
            },
        ).status_code
        == 201
    )
    return {"allergy": allergy}


def create(alice, **over):
    r = alice.post("/shares", json={**SHARE, **over})
    assert r.status_code == 201, r.text
    return r.json()


def token_of(created) -> str:
    return created["link"].split("#", 1)[1]


def code_for(outbox, email=RECIPIENT) -> str:
    mails = [m for m in outbox.outbox if m.to == email]
    assert mails, "no email sent"
    return re.search(r"\b(\d{6})\b", mails[-1].body).group(1)


def visitor_for(app, outbox) -> Actor:
    return Actor(app, outbox, "visitor@example.com")


def verify(visitor, token, code):
    return visitor.post("/share-access/verify", json={"token": token, "code": code})


def open_session(visitor, outbox, token) -> str:
    assert visitor.post("/share-access/start", json={"token": token}).status_code == 202
    r = visitor.post("/share-access/verify", json={"token": token, "code": code_for(outbox)})
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


def view(visitor, session):
    return visitor.get("/share-access/summary", headers={"X-Share-Session": session})


# ------------------------------------------------------------------ creating a share
def test_share_needs_explicit_confirmation_and_valid_scope(alice):
    for bad in (
        {"confirm": False},
        {"categories": []},
        {"categories": ["passwords"]},
        {"date_from": "2026-12-01", "date_to": "2026-01-01"},
        {"expires_in_hours": 0},
        {"expires_in_hours": 721},
        {"recipient_email": "not-an-email"},
        {"recipient_name": "  "},
        {"patient_user_id": str(uuid.uuid4())},
    ):
        assert alice.post("/shares", json={**SHARE, **bad}).status_code == 422, bad
    body = {k: v for k, v in SHARE.items() if k != "confirm"}
    assert alice.post("/shares", json=body).status_code == 422
    assert alice.get("/shares").json()["total"] == 0


def test_link_is_shown_once_and_only_a_hash_is_stored(alice, db, outbox):
    seed(alice)
    created = create(alice)
    token = token_of(created)
    assert created["link"].endswith(f"/shared#{token}") and len(token) >= 40
    assert created["notification_sent"] is True
    grant = db.scalar(select(ShareGrant))
    assert grant.token_hash != token and token not in grant.token_hash
    listed = alice.get("/shares")
    assert token not in listed.text and "link" not in listed.json()["items"][0]
    mail = outbox.outbox[-1]
    assert mail.to == RECIPIENT and token in mail.body
    # The notification says nothing about what was shared.
    for word in ("Metformin", "Penicillin", "diabetes", "Hemoglobin"):
        assert word not in mail.body


def test_create_is_audited_without_address_or_content(alice, db):
    seed(alice)
    create(alice)
    row = db.scalar(select(AuditLog).where(AuditLog.action == "share.create"))
    assert row is not None and row.event_metadata["categories"] == ["conditions", "labs"]
    assert RECIPIENT not in str(row.event_metadata)


def test_preview_shows_the_selection_and_creates_nothing(alice):
    seed(alice)
    r = alice.post("/shares/preview", json={"categories": ["allergies", "profile"]})
    assert r.status_code == 200
    body = r.json()
    assert body["allergies"][0]["substance"] == "Penicillin"
    assert body["profile"]["display_name"] == "Alice Das"
    assert body["conditions"] is None and body["labs"] is None
    assert alice.get("/shares").json()["total"] == 0


def test_active_share_limit(alice):
    for _ in range(20):
        create(alice)
    assert alice.post("/shares", json=SHARE).status_code == 409


# ------------------------------------------------------------------ recipient flow
def test_recipient_sees_only_the_shared_slice(alice, app, outbox):
    seed(alice)
    token = token_of(create(alice))
    visitor = visitor_for(app, outbox)
    session = open_session(visitor, outbox, token)
    r = view(visitor, session)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["shared_by"] == "Alice Das" and body["recipient_name"] == "Dr Rao"
    s = body["summary"]
    assert [c["display_name"] for c in s["conditions"]] == ["Type 2 diabetes"]
    # Date range: the 2025 result is outside it.
    assert [x["observed_on"] for x in s["labs"]] == ["2026-11-01"]
    # Categories that were not shared are absent, not empty.
    assert s["allergies"] is None and s["medications"] is None
    assert s["profile"] is None and s["records"] is None
    assert any("not a complete medical record" in t for t in s["limitations"])
    assert any("not a diagnosis" in t for t in s["limitations"])


def test_summary_leaves_out_removed_items_notes_and_files(alice, app, outbox):
    seeded = seed(alice)
    alice.patch(f"/allergies/{seeded['allergy']['id']}", json={"status": "entered_in_error"})
    scope = {"categories": ["allergies", "records", "medications"], "date_from": None}
    token = token_of(create(alice, **scope))
    visitor = visitor_for(app, outbox)
    r = view(visitor, open_session(visitor, outbox, token))
    s = r.json()["summary"]
    assert s["allergies"] == []
    assert s["records"][0]["title"] == "CBC Nov" and s["records"][0]["has_file"] is False
    assert SECRET_NOTE not in r.text
    assert any("not shared" in t for t in s["limitations"])
    assert any("does not prove" in t for t in s["limitations"])


def test_wrong_codes_are_limited_and_logged(alice, app, outbox, settings):
    token = token_of(create(alice))
    visitor = visitor_for(app, outbox)
    visitor.post("/share-access/start", json={"token": token})
    good = code_for(outbox)
    bad = "000000" if good != "000000" else "111111"
    for _ in range(settings.otp_max_attempts):
        r = visitor.post("/share-access/verify", json={"token": token, "code": bad})
        assert r.status_code == 400 and r.json()["error"]["code"] == "SHARE_CODE_INVALID"
    # The real code no longer works once the attempts are used up.
    assert verify(visitor, token, good).status_code == 400
    # A fresh code does.
    visitor.post("/share-access/start", json={"token": token})
    assert (
        visitor.post(
            "/share-access/verify", json={"token": token, "code": code_for(outbox)}
        ).status_code
        == 200
    )


def test_code_is_single_use_and_new_code_replaces_old(alice, app, outbox):
    token = token_of(create(alice))
    visitor = visitor_for(app, outbox)
    visitor.post("/share-access/start", json={"token": token})
    first = code_for(outbox)
    visitor.post("/share-access/start", json={"token": token})
    second = code_for(outbox)
    if first != second:
        assert verify(visitor, token, first).status_code == 400
    assert verify(visitor, token, second).status_code == 200
    assert verify(visitor, token, second).status_code == 400


def test_code_must_be_six_digits(alice, app, outbox):
    token = token_of(create(alice))
    visitor = visitor_for(app, outbox)
    for code in ("12345", "1234567", "abcdef", "12 456"):
        assert verify(visitor, token, code).status_code == 422


def test_unknown_links_look_like_valid_ones(app, outbox):
    visitor = visitor_for(app, outbox)
    token = "x" * 43
    r = visitor.post("/share-access/start", json={"token": token})
    assert r.status_code == 202 and "If this link is active" in r.json()["message"]
    assert not outbox.outbox
    v = visitor.post("/share-access/verify", json={"token": token, "code": "123456"})
    assert v.status_code == 400 and v.json()["error"]["code"] == "SHARE_CODE_INVALID"
    assert visitor.get("/share-access/summary").status_code == 401
    assert view(visitor, "garbage").status_code == 401


def test_a_tampered_session_is_refused(alice, app, outbox):
    token = token_of(create(alice))
    visitor = visitor_for(app, outbox)
    session = open_session(visitor, outbox, token)
    assert view(visitor, session[:-3] + "AAA").status_code == 401
    assert view(visitor, session).status_code == 200


# --------------------------------------------------- revocation, expiry, access log
def test_revoking_ends_access_immediately_even_for_an_open_session(alice, app, outbox):
    token = token_of(create(alice))
    share_id = alice.get("/shares").json()["items"][0]["id"]
    visitor = visitor_for(app, outbox)
    session = open_session(visitor, outbox, token)
    assert view(visitor, session).status_code == 200

    revoked = alice.post(f"/shares/{share_id}/revoke")
    assert revoked.status_code == 200 and revoked.json()["status"] == "revoked"
    gone = view(visitor, session)
    assert gone.status_code == 403 and gone.json()["error"]["code"] == "SHARE_NOT_ACTIVE"

    # The link is dead for new visitors too, and no code is sent for it.
    sent_before = len(outbox.outbox)
    assert visitor.post("/share-access/start", json={"token": token}).status_code == 202
    assert len(outbox.outbox) == sent_before
    assert (
        visitor.post("/share-access/verify", json={"token": token, "code": "123456"}).status_code
        == 400
    )
    events = [e["event"] for e in alice.get(f"/shares/{share_id}/access").json()["items"]]
    assert "blocked_revoked" in events
    # Revoking twice is harmless.
    assert alice.post(f"/shares/{share_id}/revoke").status_code == 200


def test_expired_links_stop_working(alice, app, outbox, db):
    token = token_of(create(alice))
    visitor = visitor_for(app, outbox)
    session = open_session(visitor, outbox, token)
    grant = db.scalar(select(ShareGrant))
    grant.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    db.commit()
    assert view(visitor, session).status_code == 403
    sent_before = len(outbox.outbox)
    visitor.post("/share-access/start", json={"token": token})
    assert len(outbox.outbox) == sent_before
    assert alice.get("/shares").json()["items"][0]["status"] == "expired"
    events = {e.event for e in db.scalars(select(ShareAccessLog)).all()}
    assert "blocked_expired" in events


def test_every_access_is_logged_for_the_patient(alice, app, outbox, db):
    token = token_of(create(alice))
    share_id = alice.get("/shares").json()["items"][0]["id"]
    visitor = visitor_for(app, outbox)
    session = open_session(visitor, outbox, token)
    view(visitor, session)
    view(visitor, session)
    log = alice.get(f"/shares/{share_id}/access").json()
    assert [e["event"] for e in log["items"]][:2] == ["viewed", "viewed"]
    assert {"code_sent", "verified"} <= {e["event"] for e in log["items"]}
    assert all(set(e) == {"id", "event", "created_at"} for e in log["items"])  # no IPs shown
    share = alice.get("/shares").json()["items"][0]
    assert share["access_count"] == 2 and share["last_accessed_at"] is not None
    audit = db.scalar(select(AuditLog).where(AuditLog.action == "share.view"))
    assert audit.event_metadata == {"categories": ["conditions", "labs"]}


# ------------------------------------------------------------------- ownership
def test_other_patients_cannot_see_or_revoke_a_share(alice, bob):
    create(alice)
    share_id = alice.get("/shares").json()["items"][0]["id"]
    assert bob.get("/shares").json()["total"] == 0
    assert bob.get(f"/shares/{share_id}/access").status_code == 404
    assert bob.post(f"/shares/{share_id}/revoke").status_code == 404
    assert alice.get("/shares").json()["items"][0]["status"] == "active"


def test_a_share_only_ever_shows_its_own_patient(alice, bob, app, outbox):
    seed(alice)
    bob.put("/profile", json={"display_name": "Bob Sen"})
    bob.post("/conditions", json={"display_name": "Asthma"})
    token = token_of(create(alice, categories=["conditions"]))
    visitor = visitor_for(app, outbox)
    r = view(visitor, open_session(visitor, outbox, token))
    assert "Asthma" not in r.text and "Bob" not in r.text


def test_sharing_endpoints_need_login(app, outbox):
    visitor = visitor_for(app, outbox)
    for method, path in (("GET", "/shares"), ("POST", "/shares"), ("POST", "/shares/preview")):
        assert visitor.request(method, path, json={}).status_code == 401


# ------------------------------------------------------------------ rate limiting
def test_verification_attempts_are_rate_limited(settings, outbox):
    on = Settings(**{**settings.model_dump(), "rate_limit_enabled": True})
    limited = create_app(on, email=outbox)
    try:
        visitor = Actor(limited, outbox, "visitor@example.com")
        codes = []
        for _ in range(12):
            r = visitor.post("/share-access/verify", json={"token": "t" * 43, "code": "123456"})
            codes.append(r.status_code)
        assert codes[:10] == [400] * 10 and codes[10:] == [429, 429]
    finally:
        limited.state.engine.dispose()
