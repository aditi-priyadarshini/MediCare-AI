"""Phase 9: admin console API (accounts, audit review, feedback moderation, rule versioning
and second-person review, catalogue) and the append-only audit log."""

import uuid
from datetime import date

import pytest
from sqlalchemy import select, text, update
from sqlalchemy.exc import DBAPIError

from app.audit.models import AuditLog
from app.feedback.models import Feedback
from app.identity.models import User
from app.safety.models import ActiveIngredient, ReferenceSource, SafetyRule


def promote(db, email):
    db.execute(update(User).where(User.email == email).values(role="admin"))
    db.commit()


@pytest.fixture
def admin(make_actor, db):
    a = make_actor("boss@example.com")
    promote(db, a.email)
    return a


@pytest.fixture
def admin2(make_actor, db):
    a = make_actor("boss2@example.com")
    promote(db, a.email)
    return a


# --------------------------------------------------------------------------- audit log
def test_audit_log_is_append_only_in_the_database(admin, db):
    admin.get("/admin/users")
    row = db.scalars(select(AuditLog)).first()
    with pytest.raises(DBAPIError, match="append-only"):
        db.execute(update(AuditLog).where(AuditLog.id == row.id).values(action="x"))
    db.rollback()
    with pytest.raises(DBAPIError, match="append-only"):
        db.execute(text("DELETE FROM audit_logs"))
    db.rollback()


def test_audit_viewer_shows_admin_and_auth_events_but_not_patient_data_access(admin, alice, db):
    db.add(AuditLog(action="share.revoke", resource_type="share_grant"))
    db.add(AuditLog(action="records.download", resource_type="health_record"))
    db.add(AuditLog(action="emergency.summary.view"))
    db.commit()
    admin.get("/admin/users")
    page = admin.get("/admin/audit-logs?limit=100").json()
    actions = {e["action"] for e in page["items"]}
    assert "admin.users_listed" in actions and "auth.register" in actions
    assert not {"share.revoke", "records.download", "emergency.summary.view"} & actions
    assert all(e["action"].startswith(("admin.", "auth.", "feedback.")) for e in page["items"])


def test_audit_viewer_filters_and_is_itself_audited(admin, alice, db):
    admin.get("/admin/users")
    only = admin.get("/admin/audit-logs?action=admin.users").json()
    assert only["total"] >= 1 and all(e["action"].startswith("admin.users") for e in only["items"])
    # `%` and `_` are literal, not wildcards.
    assert admin.get("/admin/audit-logs?action=%25").json()["total"] == 0
    by_actor = admin.get(f"/admin/audit-logs?actor_user_id={uuid.uuid4()}").json()
    assert by_actor["total"] == 0
    seen = db.scalars(select(AuditLog).where(AuditLog.action == "admin.audit_viewed")).all()
    assert len(seen) >= 3 and seen[0].event_metadata.get("rows") is not None


def test_audit_viewer_is_admin_only(alice, admin):
    assert alice.get("/admin/audit-logs").status_code == 403


# ------------------------------------------------------------------------ user accounts
def test_deactivate_signs_the_user_out_and_blocks_login(admin, alice):
    uid = alice.get("/auth/me").json()["user"]["id"]
    assert alice.get("/auth/me").status_code == 200
    assert admin.post(f"/admin/users/{uid}/deactivate").status_code == 200
    assert alice.get("/auth/me").status_code == 401
    assert alice.login().status_code in (401, 403)
    back = admin.post(f"/admin/users/{uid}/reactivate")
    assert back.status_code == 200 and back.json()["is_active"] is True
    assert alice.login().status_code == 200


def test_admin_cannot_deactivate_self_but_can_deactivate_another_admin(admin, admin2, alice):
    me = admin.get("/auth/me").json()["user"]["id"]
    resp = admin.post(f"/admin/users/{me}/deactivate")
    assert resp.status_code == 409 and resp.json()["error"]["code"] == "SELF_DEACTIVATION"
    # An admin may deactivate another admin; the caller always remains, so one is always active.
    other = admin2.get("/auth/me").json()["user"]["id"]
    assert admin.post(f"/admin/users/{other}/deactivate").status_code == 200
    assert admin2.get("/auth/me").status_code == 401


def test_user_actions_are_audited_and_unknown_user_404(admin, alice, db):
    uid = alice.get("/auth/me").json()["user"]["id"]
    admin.post(f"/admin/users/{uid}/deactivate")
    row = db.scalar(select(AuditLog).where(AuditLog.action == "admin.user_deactivate"))
    assert row.resource_id == uid
    assert admin.post(f"/admin/users/{uuid.uuid4()}/deactivate").status_code == 404


def test_patient_cannot_deactivate_anyone(alice, bob):
    uid = bob.get("/auth/me").json()["user"]["id"]
    assert alice.post(f"/admin/users/{uid}/deactivate").status_code == 403
    assert bob.get("/auth/me").status_code == 200


# --------------------------------------------------------------------------- feedback
def test_feedback_roundtrip_and_isolation(alice, bob, admin, db):
    sent = alice.post(
        "/feedback",
        json={"category": "bug", "message": "The labs page is slow.", "page": "/labs?x=1"},
    )
    assert sent.status_code == 201
    body = sent.json()
    assert body["status"] == "new" and body["page"] is None  # query strings are never kept
    assert set(body) == {"id", "category", "message", "page", "status", "created_at"}
    assert alice.get("/feedback").json()["total"] == 1
    assert bob.get("/feedback").json()["total"] == 0  # other patients never see it
    # The audit row records the category, never the words.
    row = db.scalar(select(AuditLog).where(AuditLog.action == "feedback.sent"))
    assert row.event_metadata == {"category": "bug"} and "slow" not in str(row.event_metadata)


@pytest.mark.parametrize(
    "payload",
    [
        {"message": "no"},
        {"message": "x" * 2001},
        {"message": "fine message", "category": "nope"},
        {"message": "fine message", "user_id": str(uuid.uuid4())},
        {"message": "fine message", "status": "actioned"},
    ],
)
def test_feedback_validation(alice, payload):
    assert alice.post("/feedback", json=payload).status_code == 422


def test_feedback_moderation_flow(alice, admin, db):
    fid = alice.post("/feedback", json={"message": "Please add dark mode."}).json()["id"]
    queue = admin.get("/admin/feedback").json()
    assert queue["total"] == 1 and queue["items"][0]["user_id"]
    done = admin.post(
        f"/admin/feedback/{fid}/moderate", json={"status": "actioned", "note": "Logged #12"}
    )
    assert done.status_code == 200 and done.json()["moderated_by_user_id"]
    assert admin.get("/admin/feedback").json()["total"] == 0
    assert admin.get("/admin/feedback?status=actioned").json()["total"] == 1
    # The sender sees the status, never the moderator's note or who moderated.
    mine = alice.get("/feedback").json()["items"][0]
    assert mine["status"] == "actioned" and "moderator_note" not in mine
    # Putting it back to "new" clears who moderated (and satisfies the database check).
    reopened = admin.post(f"/admin/feedback/{fid}/moderate", json={"status": "new"})
    assert reopened.json()["moderated_at"] is None
    assert db.get(Feedback, uuid.UUID(fid)).status == "new"
    assert (
        admin.post(
            f"/admin/feedback/{uuid.uuid4()}/moderate", json={"status": "reviewed"}
        ).status_code
        == 404
    )
    assert (
        admin.post(f"/admin/feedback/{fid}/moderate", json={"status": "bogus"}).status_code == 422
    )


def test_patient_cannot_read_or_moderate_feedback_queue(alice, bob):
    fid = bob.post("/feedback", json={"message": "Something to say."}).json()["id"]
    assert alice.get("/admin/feedback").status_code == 403
    assert (
        alice.post(f"/admin/feedback/{fid}/moderate", json={"status": "dismissed"}).status_code
        == 403
    )


def test_feedback_is_rate_limited(app, make_actor):
    app.state.settings.rate_limit_enabled = True
    a = make_actor("chatty@example.com")
    codes = [
        a.post("/feedback", json={"message": f"message number {i}"}).status_code for i in range(12)
    ]
    assert codes.count(201) == 10 and codes[-1] == 429


def test_feedback_is_not_an_adverse_event_report(alice, db):
    from app.safety.models import AdverseEventReport

    alice.post("/feedback", json={"message": "It crashed when I opened it."})
    assert db.scalars(select(AdverseEventReport)).all() == []


# ------------------------------------------------------------- rule versioning / review
@pytest.fixture
def rule_setup(db):
    src = ReferenceSource(
        name="Rulebook", version="v1", jurisdiction="IN", reviewed_at=date(2026, 11, 1)
    )
    db.add(src)
    db.flush()
    ings = []
    for name in ("Alpha", "Beta"):
        i = ActiveIngredient(name=name, normalized_name=name.lower(), source_id=src.id)
        db.add(i)
        ings.append(i)
    db.commit()
    return src, ings


def rule_body(src, ings, severity="moderate", version="v1"):
    return {
        "kind": "drug_drug",
        "ingredient_id": str(ings[0].id),
        "counterpart_ingredient_id": str(ings[1].id),
        "severity": severity,
        "description": "Test interaction description.",
        "source_id": str(src.id),
        "source_version": version,
        "reviewed_at": "2026-11-01",
        "jurisdiction": "IN",
    }


def test_supersede_creates_linked_version_and_retires_old(admin, rule_setup, db):
    src, ings = rule_setup
    first = admin.post("/admin/safety-rules", json=rule_body(src, ings)).json()
    assert first["version"] == 1 and first["review_status"] == "unreviewed"
    new = admin.post(
        f"/admin/safety-rules/{first['id']}/supersede",
        json=rule_body(src, ings, severity="major"),  # same source+version: slot must be freed
    )
    assert new.status_code == 201, new.text
    n = new.json()
    assert n["version"] == 2 and n["supersedes_rule_id"] == first["id"] and n["status"] == "active"
    old = db.get(SafetyRule, uuid.UUID(first["id"]))
    db.refresh(old)
    assert old.status == "retired" and old.retired_at and old.severity == "moderate"  # untouched
    active = admin.get("/admin/safety-rules").json()
    assert [r["id"] for r in active["items"]] == [n["id"]]
    # History is the same from either end, oldest first.
    for rid in (first["id"], n["id"]):
        hist = admin.get(f"/admin/safety-rules/{rid}/history").json()
        assert [h["version"] for h in hist] == [1, 2]
    assert db.scalar(select(AuditLog).where(AuditLog.action == "admin.rule_supersede"))


def test_supersede_rejects_inactive_and_kind_change(admin, rule_setup):
    src, ings = rule_setup
    first = admin.post("/admin/safety-rules", json=rule_body(src, ings)).json()
    food = {
        **rule_body(src, ings),
        "kind": "drug_food",
        "counterpart_ingredient_id": None,
        "counterpart_term": "grapefruit",
    }
    assert admin.post(f"/admin/safety-rules/{first['id']}/supersede", json=food).status_code == 422
    admin.post(f"/admin/safety-rules/{first['id']}/retire")
    resp = admin.post(f"/admin/safety-rules/{first['id']}/supersede", json=rule_body(src, ings))
    assert resp.status_code == 409 and resp.json()["error"]["code"] == "RULE_NOT_ACTIVE"
    assert (
        admin.post(
            f"/admin/safety-rules/{uuid.uuid4()}/supersede", json=rule_body(src, ings)
        ).status_code
        == 404
    )


def test_failed_supersede_leaves_old_rule_active(admin, rule_setup):
    src, ings = rule_setup
    first = admin.post("/admin/safety-rules", json=rule_body(src, ings)).json()
    bad = {**rule_body(src, ings), "ingredient_id": str(uuid.uuid4())}
    assert admin.post(f"/admin/safety-rules/{first['id']}/supersede", json=bad).status_code == 422
    assert admin.get("/admin/safety-rules").json()["items"][0]["status"] == "active"


def test_second_person_review(admin, admin2, rule_setup, db):
    src, ings = rule_setup
    rid = admin.post("/admin/safety-rules", json=rule_body(src, ings)).json()["id"]
    own = admin.post(f"/admin/safety-rules/{rid}/review")
    assert own.status_code == 403 and own.json()["error"]["code"] == "SELF_REVIEW"
    ok = admin2.post(f"/admin/safety-rules/{rid}/review")
    assert ok.status_code == 200
    data = ok.json()
    assert (
        data["review_status"] == "approved"
        and data["reviewed_by_user_id"] != data["created_by_user_id"]
    )
    # Repeating is harmless; a superseding version starts unreviewed again.
    assert admin2.post(f"/admin/safety-rules/{rid}/review").status_code == 200
    v2 = admin.post(
        f"/admin/safety-rules/{rid}/supersede", json=rule_body(src, ings, "major")
    ).json()
    assert v2["review_status"] == "unreviewed"
    assert admin2.post(f"/admin/safety-rules/{rid}/review").status_code == 409  # retired now
    assert admin.get("/admin/overview").json()["rules_unreviewed"] == 1


def test_database_refuses_self_approved_rule(admin, rule_setup, db):
    src, ings = rule_setup
    rid = admin.post("/admin/safety-rules", json=rule_body(src, ings)).json()["id"]
    row = db.get(SafetyRule, uuid.UUID(rid))
    from datetime import UTC, datetime

    row.review_status, row.reviewed_by_user_id = "approved", row.created_by_user_id
    row.peer_reviewed_at = datetime.now(UTC)
    with pytest.raises(Exception, match="review_is_second_person"):
        db.commit()
    db.rollback()


def test_patient_cannot_use_rule_endpoints(alice, admin, rule_setup):
    src, ings = rule_setup
    rid = admin.post("/admin/safety-rules", json=rule_body(src, ings)).json()["id"]
    for method, url in (
        ("get", f"/admin/safety-rules/{rid}/history"),
        ("post", f"/admin/safety-rules/{rid}/review"),
        ("post", f"/admin/safety-rules/{rid}/retire"),
    ):
        assert getattr(alice, method)(url).status_code == 403


# ------------------------------------------------------------- catalogue and overview
def test_catalogue_listing_and_search(admin, alice):
    admin.post(
        "/admin/medicines", json={"name": "Zorbex", "form": "tablet", "strength_text": "5 mg"}
    )
    found = admin.get("/admin/medicines?q=zorb").json()
    assert found["total"] == 1 and found["items"][0]["source"] == "admin"
    assert admin.get("/admin/medicines?q=%25").json()["total"] == 0  # % is literal
    assert alice.get("/admin/medicines").status_code == 403


def test_overview_counts(admin, alice):
    alice.post("/feedback", json={"message": "Hello there team."})
    data = admin.get("/admin/overview").json()
    assert data["users"] == 2 and data["feedback_new"] == 1 and data["inactive_users"] == 0
    assert alice.get("/admin/overview").status_code == 403
