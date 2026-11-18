"""The development-only test-call helper (POST /calls/dev/test).

It exists so the phone app and the WebRTC audio can be tried without waiting for a schedule. It
must not exist in production, must never change a dose, and must not leave a medicine in the
patient's list."""

import pytest
from sqlalchemy import select

from app.calls import router as calls_router
from app.calls.models import ReminderCall
from app.calls.push import MemoryPushProvider
from app.core.config import Settings
from app.medications.models import DoseLog
from tests.test_calls import TOKEN_A, register_device


@pytest.fixture
def settings(tmp_path) -> Settings:
    from tests.conftest import TEST_DB_URL

    return Settings(
        storage_dir=str(tmp_path / "files"),
        environment="development",
        database_url=TEST_DB_URL,
        email_backend="memory",
        rate_limit_enabled=False,
        otp_resend_cooldown_seconds=0,
        calls_enabled=True,
    )


@pytest.fixture
def memory_push(monkeypatch) -> MemoryPushProvider:
    provider = MemoryPushProvider()
    monkeypatch.setattr(calls_router, "build_push_provider", lambda _settings: provider)
    return provider


def test_direct_call_rings_can_be_answered_and_never_touches_the_dose(alice, db):
    r = alice.post("/calls/dev/test", json={"mode": "direct"})
    assert r.status_code == 201, r.text
    call_id = r.json()["id"]
    assert r.json()["status"] == "ringing"

    acc = alice.post(f"/calls/{call_id}/accept")
    assert acc.status_code == 200, acc.text
    assert acc.json()["dose"]["medication_name"].startswith("Test reminder")
    assert acc.json()["ticket"]

    (dose,) = db.scalars(select(DoseLog)).all()
    assert dose.status == "pending" and dose.taken_at is None  # a call never marks a dose


def test_the_test_medicine_never_appears_in_the_patients_list(alice):
    alice.post("/calls/dev/test", json={})
    alice.post("/calls/dev/test", json={})  # reused, not duplicated
    assert alice.get("/medications").json()["items"] == []
    items = alice.get("/medications?include_inactive=true").json()["items"]
    names = {m["display_name"] for m in items}
    assert len(names) == 1


def test_push_mode_needs_a_registered_phone(alice):
    r = alice.post("/calls/dev/test", json={"mode": "push"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "NO_DEVICE"


def test_push_mode_sends_a_push_that_names_no_medicine(alice, db, memory_push):
    register_device(alice)
    r = alice.post("/calls/dev/test", json={"mode": "push", "delay_seconds": 0})
    assert r.status_code == 201, r.text
    assert len(memory_push.sent) == 1
    sent = memory_push.sent[0]
    assert sent.target.push_token == TOKEN_A and sent.call_id == r.json()["id"]
    assert "Test reminder" not in repr(sent)


def test_a_failed_push_is_recorded_not_faked(alice, db, memory_push):
    from app.calls.push import PushError

    register_device(alice)
    memory_push.fail_with = PushError("UNAVAILABLE")
    alice.post("/calls/dev/test", json={"mode": "push"})
    (call,) = db.scalars(select(ReminderCall)).all()
    db.refresh(call)
    assert call.status == "failed" and call.end_reason == "push_failed"


def test_delay_is_bounded(alice):
    r = alice.post("/calls/dev/test", json={"mode": "push", "delay_seconds": 600})
    assert r.status_code == 422


def test_needs_login(app):
    from fastapi.testclient import TestClient

    assert TestClient(app).post("/api/v1/calls/dev/test", json={}).status_code == 401
