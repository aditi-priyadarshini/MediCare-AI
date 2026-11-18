"""Reminder calls: devices, consent gating, the worker's ring rules, the call state machine,
privacy of the push payload, signalling tickets, and the rule that a call never marks a dose.

Needs PostgreSQL like the rest of the suite. The WebRTC media path itself (aiortc, TURN, real
pushes) is not covered here: it needs a device. See docs/REMINDER_CALLS.md."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.calls import service as call_service
from app.calls.models import Device, ReminderCall
from app.calls.push import MemoryPushProvider, PushError
from app.core.config import Settings
from app.identity.providers import MemoryEmailProvider
from app.medications import worker
from app.medications.models import DoseLog
from tests.test_medications import add_dose, make_med, make_schedule

TOKEN_A = "fcm-token-" + "a" * 40
TOKEN_B = "fcm-token-" + "b" * 40
SECRET_NAME = "Secretdrug"


@pytest.fixture
def settings(tmp_path) -> Settings:
    from tests.conftest import TEST_DB_URL

    return Settings(
        storage_dir=str(tmp_path / "files"),
        environment="test",
        database_url=TEST_DB_URL,
        email_backend="memory",
        rate_limit_enabled=False,
        otp_resend_cooldown_seconds=0,
        calls_enabled=True,
        turn_urls="turn:turn.example.org:3478?transport=udp",
        turn_secret="t" * 40,
    )


@pytest.fixture
def push() -> MemoryPushProvider:
    return MemoryPushProvider()


def register_device(actor, token=TOKEN_A, **over):
    body = {"platform": "android", "push_token": token, "app_version": "1.0.0", **over}
    r = actor.post("/devices", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def due_dose(actor, db, email="alice@example.com", minutes_ago=2):
    med = make_med(actor, display_name=SECRET_NAME)
    sched = make_schedule(actor, med["id"], times=["03:17"])
    return add_dose(
        db, email, med["id"], sched["id"], datetime.now(UTC) - timedelta(minutes=minutes_ago)
    )


def tick(db, settings, push, now=None):
    return worker.tick(db, now or datetime.now(UTC), MemoryEmailProvider(), settings, push)


def calls(db):
    return db.scalars(select(ReminderCall).order_by(ReminderCall.attempt)).all()


def ready_patient(actor, db):
    """Consent given, one device registered, one dose due a moment ago."""
    assert actor.put("/consents/reminder_call", json={"granted": True}).status_code == 200
    register_device(actor)
    return due_dose(actor, db)


# ------------------------------------------------------------------------------ devices
def test_device_registration_is_idempotent_and_listed(alice):
    first = register_device(alice)
    again = register_device(alice, app_version="1.0.1")
    assert first["id"] == again["id"]
    rows = alice.get("/devices").json()
    assert len(rows) == 1 and rows[0]["app_version"] == "1.0.1" and rows[0]["can_ring"] is True


def test_ios_device_without_voip_token_cannot_ring(alice):
    d = register_device(alice, platform="ios", push_token="apns-" + "c" * 40)
    assert d["can_ring"] is False
    d2 = register_device(alice, platform="ios", push_token="apns-" + "c" * 40, voip_token="v" * 40)
    assert d2["can_ring"] is True


def test_token_moves_to_the_account_that_signs_in_on_the_phone(alice, bob):
    register_device(alice)
    register_device(bob)  # same phone, different person
    assert alice.get("/devices").json() == []
    assert len(bob.get("/devices").json()) == 1


def test_cannot_remove_someone_elses_device(alice, bob):
    dev = register_device(alice)
    assert bob.delete(f"/devices/{dev['id']}").status_code == 404
    assert alice.delete(f"/devices/{dev['id']}").status_code == 204
    assert alice.get("/devices").json() == []


def test_device_endpoints_need_login(app):
    from fastapi.testclient import TestClient

    anon = TestClient(app)
    assert anon.get("/api/v1/devices").status_code == 401
    assert anon.get("/api/v1/calls").status_code == 401


# ------------------------------------------------------------------------- ring rules
def test_no_call_without_consent(alice, db, settings, push):
    register_device(alice)
    due_dose(alice, db)
    tick(db, settings, push)
    assert push.sent == [] and calls(db) == []


def test_no_call_without_a_device(alice, db, settings, push):
    alice.put("/consents/reminder_call", json={"granted": True})
    due_dose(alice, db)
    tick(db, settings, push)
    assert push.sent == [] and calls(db) == []


def test_no_call_when_the_feature_is_off(alice, db, settings, push):
    dose = ready_patient(alice, db)
    off = settings.model_copy(update={"calls_enabled": False})
    tick(db, off, push)
    assert push.sent == [] and calls(db) == [] and dose.status == "pending"


def test_a_due_dose_rings_once_and_the_push_names_no_medicine(alice, db, settings, push):
    ready_patient(alice, db)
    stats = tick(db, settings, push)
    assert stats.calls_rung == 1 and len(push.sent) == 1
    sent = push.sent[0]
    assert sent.target.push_token == TOKEN_A
    assert SECRET_NAME not in repr(sent)
    (call,) = calls(db)
    assert call.status == "ringing" and call.attempt == 1 and str(call.id) == sent.call_id
    # a repeated tick, or a second overlapping worker, doesn't ring again
    tick(db, settings, push)
    assert len(push.sent) == 1 and len(calls(db)) == 1


def test_only_the_most_recently_seen_device_rings(alice, db, settings, push):
    alice.put("/consents/reminder_call", json={"granted": True})
    register_device(alice, token=TOKEN_A)
    register_device(alice, token=TOKEN_B)  # seen last
    due_dose(alice, db)
    tick(db, settings, push)
    assert [s.target.push_token for s in push.sent] == [TOKEN_B]


def test_old_doses_are_not_rung(alice, db, settings, push):
    alice.put("/consents/reminder_call", json={"granted": True})
    register_device(alice)
    due_dose(alice, db, minutes_ago=settings.call_max_age_minutes + 5)
    tick(db, settings, push)
    assert push.sent == []


def test_missed_call_is_retried_once_after_the_wait_then_stops(alice, db, settings, push):
    ready_patient(alice, db)
    now = datetime.now(UTC)
    tick(db, settings, push, now)
    # rings out
    later = now + timedelta(seconds=settings.call_ring_seconds + 1)
    tick(db, settings, push, later)
    assert [c.status for c in calls(db)] == ["missed"]
    # too soon for a retry
    assert len(push.sent) == 1
    # after the retry wait: second ring
    retry_at = later + timedelta(seconds=settings.call_retry_after_seconds + 1)
    tick(db, settings, push, retry_at)
    assert len(push.sent) == 2 and [c.attempt for c in calls(db)] == [1, 2]
    # rings out again: no third attempt
    wait = settings.call_ring_seconds + settings.call_retry_after_seconds + 5
    end = retry_at + timedelta(seconds=wait)
    tick(db, settings, push, end)
    tick(db, settings, push, end + timedelta(minutes=1))
    assert len(push.sent) == 2


def test_declined_call_is_never_retried(alice, db, settings, push):
    ready_patient(alice, db)
    tick(db, settings, push)
    (call,) = calls(db)
    assert alice.post(f"/calls/{call.id}/decline").status_code == 200
    # well past the retry wait, and the dose is still recent enough to ring for
    after_wait = timedelta(seconds=settings.call_retry_after_seconds + 60)
    tick(db, settings, push, datetime.now(UTC) + after_wait)
    assert len(push.sent) == 1 and len(calls(db)) == 1


def test_push_failure_is_recorded_and_a_dead_token_is_revoked(alice, db, settings, push):
    ready_patient(alice, db)
    push.fail_with = PushError("UNREGISTERED", permanent=True)
    stats = tick(db, settings, push)
    assert stats.calls_failed == 1
    (call,) = calls(db)
    assert call.status == "failed" and call.end_reason == "push_failed"
    assert db.scalar(select(Device.revoked_at)) is not None
    assert alice.get("/devices").json() == []


def test_dose_taken_before_the_worker_runs_is_not_rung(alice, db, settings, push):
    dose = ready_patient(alice, db)
    assert alice.post(f"/doses/{dose.id}/take", json={}).status_code == 200
    tick(db, settings, push)
    assert push.sent == []


# --------------------------------------------------------------------- the call itself
def ring(alice, db, settings, push):
    dose = ready_patient(alice, db)
    tick(db, settings, push)
    (call,) = calls(db)
    return dose, call


def test_accept_returns_details_ice_and_ticket_but_does_not_touch_the_dose(
    alice, db, settings, push
):
    dose, call = ring(alice, db, settings, push)
    before = alice.get(f"/calls/{call.id}").json()
    assert SECRET_NAME not in str(before)  # nothing about the medicine before answering
    r = alice.post(f"/calls/{call.id}/accept")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["call"]["status"] == "answered"
    assert body["dose"]["medication_name"] == SECRET_NAME
    assert SECRET_NAME in body["dose"]["spoken_text"]
    assert body["ws_path"] == f"/api/v1/calls/{call.id}/ws"
    turn = [s for s in body["ice_servers"] if "username" in s]
    assert turn and turn[0]["credential"]
    assert turn[0]["username"].endswith(str(call.patient_user_id))
    db.expire_all()
    fresh = db.get(DoseLog, dose.id)
    assert fresh.status == "pending" and fresh.taken_at is None  # answering != taking


def test_answering_twice_or_after_the_ring_expired_is_refused(alice, db, settings, push):
    _dose, call = ring(alice, db, settings, push)
    assert alice.post(f"/calls/{call.id}/accept").status_code == 200
    assert alice.post(f"/calls/{call.id}/accept").status_code == 409

    # a second call, left to ring out
    med = make_med(alice, display_name="Other")
    sched = make_schedule(alice, med["id"], times=["03:18"])
    when = datetime.now(UTC) - timedelta(minutes=1)
    add_dose(db, "alice@example.com", med["id"], sched["id"], when)
    tick(db, settings, push)
    second = [c for c in calls(db) if c.id != call.id][0]
    second.ring_expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db.commit()
    r = alice.post(f"/calls/{second.id}/accept")
    assert r.status_code == 409 and r.json()["error"]["code"] == "CALL_NOT_RINGING"
    db.expire_all()
    assert db.get(ReminderCall, second.id).status == "missed"


def test_accepting_after_the_dose_was_taken_closes_the_call(alice, db, settings, push):
    dose, call = ring(alice, db, settings, push)
    alice.post(f"/doses/{dose.id}/take", json={})
    r = alice.post(f"/calls/{call.id}/accept")
    assert r.status_code == 409 and r.json()["error"]["code"] == "DOSE_ALREADY_LOGGED"
    db.expire_all()
    assert db.get(ReminderCall, call.id).status == "completed"


def test_calls_are_private_to_their_patient(alice, bob, db, settings, push):
    _dose, call = ring(alice, db, settings, push)
    for method, path in (
        ("GET", f"/calls/{call.id}"),
        ("POST", f"/calls/{call.id}/accept"),
        ("POST", f"/calls/{call.id}/decline"),
        ("POST", f"/calls/{call.id}/end"),
    ):
        assert bob.request(method, path).status_code == 404, path
    assert bob.get("/calls").json() == []
    assert len(alice.get("/calls").json()) == 1


def test_end_is_idempotent_and_final(alice, db, settings, push):
    _dose, call = ring(alice, db, settings, push)
    alice.post(f"/calls/{call.id}/accept")
    assert alice.post(f"/calls/{call.id}/end").json()["status"] == "completed"
    assert alice.post(f"/calls/{call.id}/end").json()["status"] == "completed"
    assert alice.post(f"/calls/{call.id}/decline").json()["status"] == "completed"


def test_answered_call_left_open_is_closed_by_the_worker(alice, db, settings, push):
    _dose, call = ring(alice, db, settings, push)
    alice.post(f"/calls/{call.id}/accept")
    overdue = timedelta(seconds=settings.call_session_max_seconds + 5)
    tick(db, settings, push, datetime.now(UTC) + overdue)
    db.expire_all()
    c = db.get(ReminderCall, call.id)
    assert c.status == "completed" and c.end_reason == "session_timeout"


def test_a_call_never_changes_the_dose_whatever_happens(alice, db, settings, push):
    dose, call = ring(alice, db, settings, push)
    alice.post(f"/calls/{call.id}/accept")
    alice.post(f"/calls/{call.id}/end")
    tick(db, settings, push, datetime.now(UTC) + timedelta(hours=1))
    db.expire_all()
    fresh = db.get(DoseLog, dose.id)
    assert fresh.status == "pending" and fresh.taken_at is None


# --------------------------------------------------------------------------- tickets / ICE
def test_ticket_is_bound_to_call_and_user_and_expires(settings):
    call_id, user_id = uuid.uuid4(), uuid.uuid4()
    ticket = call_service.make_ticket(settings, call_id, user_id)
    assert call_service.read_ticket(settings, ticket) == (call_id, user_id)
    with pytest.raises(Exception, match="invalid or has expired"):
        call_service.read_ticket(settings, ticket + "x")
    short = settings.model_copy(update={"call_ticket_ttl_seconds": -1})
    with pytest.raises(Exception, match="invalid or has expired"):
        call_service.read_ticket(short, ticket)


def test_turn_credentials_follow_the_coturn_rest_scheme(settings):
    import base64
    import hashlib
    import hmac

    uid, now = uuid.uuid4(), datetime(2026, 11, 18, 12, 0, tzinfo=UTC)
    turn = [s for s in call_service.ice_servers(settings, uid, now) if "username" in s][0]
    expiry, user = turn["username"].split(":", 1)
    ttl = timedelta(seconds=settings.turn_credential_ttl_seconds)
    assert int(expiry) == int((now + ttl).timestamp())
    assert user == str(uid)
    expected = base64.b64encode(
        hmac.new(settings.turn_secret.encode(), turn["username"].encode(), hashlib.sha1).digest()
    ).decode()
    assert turn["credential"] == expected


def test_no_turn_entry_without_a_secret(settings):
    bare = settings.model_copy(update={"turn_secret": None})
    servers = call_service.ice_servers(bare, uuid.uuid4(), datetime.now(UTC))
    assert all("username" not in s for s in servers)


def test_websocket_refuses_a_bad_ticket(app, alice, db, settings, push):
    from fastapi.testclient import TestClient
    from starlette.websockets import WebSocketDisconnect

    _dose, call = ring(alice, db, settings, push)
    client = TestClient(app)
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect(f"/api/v1/calls/{call.id}/ws?ticket=nonsense"):
            pass
    assert exc.value.code == 4401


def test_websocket_refuses_a_ticket_until_the_call_is_answered(app, alice, db, settings, push):
    from fastapi.testclient import TestClient
    from starlette.websockets import WebSocketDisconnect

    _dose, call = ring(alice, db, settings, push)
    ticket = call_service.make_ticket(settings, call.id, call.patient_user_id)  # still ringing
    with pytest.raises(WebSocketDisconnect) as exc:
        with TestClient(app).websocket_connect(f"/api/v1/calls/{call.id}/ws?ticket={ticket}"):
            pass
    assert exc.value.code == 4401


def test_production_requires_turn_when_calls_are_on():
    with pytest.raises(ValueError, match="TURN_URLS"):
        Settings(
            environment="production",
            secret_key="p" * 40,
            cookie_secure=True,
            email_backend="smtp",
            calls_enabled=True,
        )


def test_dev_test_call_does_not_exist_outside_development(alice):
    """The helper answers 404 unless ENVIRONMENT=development (these tests run as 'test')."""
    r = alice.post("/calls/dev/test", json={"mode": "direct"})
    assert r.status_code == 404
