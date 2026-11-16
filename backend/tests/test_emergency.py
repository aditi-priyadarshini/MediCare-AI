"""Phase 8 emergency: minimum-necessary summary, practice ambulance flow, provider contract."""

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.audit.models import AuditLog
from app.emergency.models import EmergencySimulation
from app.emergency.providers import DispatchAcceptance, DispatchRequest, ProviderUnavailable
from app.identity.models import User
from app.main import create_app
from tests.conftest import Actor

START = {"confirm": True, "understand_simulation": True}
LAT, LON = 20.2961, 85.8245
DISPATCH = {"latitude": LAT, "longitude": LON, "confirm": True}


def seed(alice):
    alice.put("/profile", json={"display_name": "Alice Das", "blood_group": "O+"})
    alice.post("/allergies", json={"substance": "Pollen", "severity": "mild"})
    alice.post("/allergies", json={"substance": "Penicillin", "severity": "severe"})
    alice.post("/conditions", json={"display_name": "Asthma"})
    alice.post("/medications", json={"display_name": "Salbutamol", "dose_text": "2 puffs"})
    alice.post(
        "/emergency/contacts",
        json={"name": "Ravi Das", "relationship": "Brother", "phone_e164": "+919876543210"},
    )


# ------------------------------------------------------------------------ summary
def test_default_summary_is_the_minimum_useful_set(alice):
    seed(alice)
    r = alice.get("/emergency/summary")
    assert r.status_code == 200
    s = r.json()
    assert s["display_name"] == "Alice Das" and s["blood_group"] == "O+"
    # Severe first, so a responder reads it first.
    assert [a["substance"] for a in s["allergies"]] == ["Penicillin", "Pollen"]
    assert s["contacts"][0]["phone_e164"] == "+919876543210" and "email" not in s["contacts"][0]
    # Conditions and medicines are off until the patient turns them on.
    assert s["conditions"] is None and s["medications"] is None
    assert any("Nothing on this page has been sent" in t for t in s["limitations"])
    assert any("incomplete or out of date" in t for t in s["limitations"])


def test_settings_control_exactly_what_appears(alice):
    seed(alice)
    assert alice.get("/emergency/settings").json() == {
        "include_blood_group": True,
        "include_allergies": True,
        "include_conditions": False,
        "include_medications": False,
        "include_contacts": True,
    }
    on = {
        "include_blood_group": False,
        "include_allergies": False,
        "include_conditions": True,
        "include_medications": True,
        "include_contacts": False,
    }
    assert alice.put("/emergency/settings", json=on).json() == on
    s = alice.get("/emergency/summary").json()
    assert s["blood_group"] is None and s["allergies"] is None and s["contacts"] is None
    assert [c["display_name"] for c in s["conditions"]] == ["Asthma"]
    assert s["medications"][0]["display_name"] == "Salbutamol"
    assert any("does not prove" in t for t in s["limitations"])
    assert alice.put("/emergency/settings", json={**on, "everything": True}).status_code == 422


def test_removed_items_are_left_out_and_other_patients_never_appear(alice, bob):
    seed(alice)
    bob.post("/allergies", json={"substance": "Latex", "severity": "severe"})
    allergy_id = alice.get("/allergies").json()["items"][0]["id"]
    alice.patch(f"/allergies/{allergy_id}", json={"status": "entered_in_error"})
    s = alice.get("/emergency/summary").json()
    names = [a["substance"] for a in s["allergies"]]
    assert "Latex" not in names and len(names) == 1


def test_summary_views_are_audited_with_counts_only(alice, db):
    seed(alice)
    alice.get("/emergency/summary")
    row = db.scalar(select(AuditLog).where(AuditLog.action == "emergency.summary.view"))
    assert row.event_metadata == {"blood_group": 1, "allergies": 2, "contacts": 1}
    assert "Penicillin" not in str(row.event_metadata) and "Ravi" not in str(row.event_metadata)


# ----------------------------------------------------------------- practice flow
def test_practice_run_needs_two_confirmations(alice):
    for body in ({}, {"confirm": True}, {"understand_simulation": True},
                 {"confirm": False, "understand_simulation": True},
                 {"confirm": True, "understand_simulation": False}):
        assert alice.post("/emergency/simulations", json=body).status_code == 422, body
    assert alice.get("/emergency/simulations").json() == []


def test_practice_run_is_always_labelled_and_moves_only_on_patient_action(alice):
    r = alice.post("/emergency/simulations", json=START)
    assert r.status_code == 201
    sim = r.json()
    assert sim["is_simulation"] is True and sim["status"] == "requested"
    assert "SIMULATION ONLY" in sim["notice"] and "112" in sim["notice"]
    assert sim["is_open"] is True and sim["next_status"] == "acknowledged"
    # Nothing advances by itself: reading it again changes nothing.
    assert alice.get("/emergency/simulations").json()[0]["status"] == "requested"

    seen = [sim["status"]]
    while sim["is_open"]:
        sim = alice.post(f"/emergency/simulations/{sim['id']}/advance").json()
        assert sim["is_simulation"] is True and "SIMULATION ONLY" in sim["notice"]
        seen.append(sim["status"])
    assert seen == ["requested", "acknowledged", "en_route", "arrived"]
    assert [h["status"] for h in sim["history"]] == seen and sim["next_status"] is None
    assert alice.post(f"/emergency/simulations/{sim['id']}/advance").status_code == 409
    assert alice.post(f"/emergency/simulations/{sim['id']}/cancel").status_code == 409


def test_one_open_run_at_a_time_and_cancel_frees_the_slot(alice):
    first = alice.post("/emergency/simulations", json=START).json()
    again = alice.post("/emergency/simulations", json=START)
    assert again.status_code == 409 and again.json()["error"]["code"] == "SIMULATION_OPEN"
    cancelled = alice.post(f"/emergency/simulations/{first['id']}/cancel").json()
    assert cancelled["status"] == "cancelled" and cancelled["is_open"] is False
    assert alice.post("/emergency/simulations", json=START).status_code == 201


def test_practice_run_records_the_choice_but_never_coordinates(alice, db):
    assert alice.post("/emergency/simulations", json={**START, "latitude": LAT}).status_code == 422
    sim = alice.post("/emergency/simulations", json={**START, "share_location": True}).json()
    assert sim["location_shared"] is True
    row = db.scalar(select(EmergencySimulation))
    assert row.location_shared is True and str(LAT) not in str(row.history)
    assert str(LAT) not in str([a.event_metadata for a in db.scalars(select(AuditLog)).all()])


def test_practice_runs_belong_to_their_owner(alice, bob):
    sim = alice.post("/emergency/simulations", json=START).json()
    assert bob.post(f"/emergency/simulations/{sim['id']}/advance").status_code == 404
    assert bob.post(f"/emergency/simulations/{sim['id']}/cancel").status_code == 404
    assert bob.get("/emergency/simulations").json() == []
    assert alice.get("/emergency/simulations").json()[0]["status"] == "requested"


def test_database_refuses_anything_that_is_not_a_simulation(alice, db):
    uid = db.scalar(select(User.id).where(User.email == "alice@example.com"))
    real = EmergencySimulation(
        patient_user_id=uid, mode="dispatched", status="requested", history=[]
    )
    db.add(real)
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    odd = EmergencySimulation(
        patient_user_id=uid, mode="simulated", status="confirmed", history=[]
    )
    db.add(odd)
    with pytest.raises(IntegrityError):
        db.commit()


# ------------------------------------------------------------- real dispatch contract
class Ambulance:
    def __init__(self, reference: str | None = "AMB-123", unavailable: bool = False):
        self.reference, self.unavailable, self.requests = reference, unavailable, []

    def request(self, req: DispatchRequest) -> DispatchAcceptance:
        self.requests.append(req)
        if self.unavailable:
            raise ProviderUnavailable("down")
        return DispatchAcceptance(reference=self.reference, accepted_at=datetime.now(UTC))


def actor_with(settings, outbox, ambulance) -> tuple[Actor, object]:
    app = create_app(settings, email=outbox, ambulance=ambulance)
    actor = Actor(app, outbox, f"dispatch{uuid.uuid4().hex[:6]}@example.com")
    assert actor.register().status_code == 201 and actor.verify().status_code == 200
    return actor, app


def test_without_a_provider_nothing_is_requested_and_the_app_says_so(alice, db):
    r = alice.post("/emergency/dispatch-requests", json=DISPATCH)
    assert r.status_code == 503
    err = r.json()["error"]
    assert err["code"] == "AMBULANCE_PROVIDER_UNAVAILABLE"
    assert "nothing was requested" in err["message"] and "112" in err["message"]
    row = db.scalar(select(AuditLog).where(AuditLog.action == "emergency.dispatch"))
    assert row.event_metadata == {"outcome": "unavailable"}
    assert "20.29" not in str(row.event_metadata) and "85.82" not in str(row.event_metadata)


def test_status_says_whether_dispatch_exists(alice, settings, outbox):
    assert alice.get("/emergency/status").json() == {
        "emergency_number": "112",
        "dispatch_available": False,
    }
    actor, app = actor_with(settings, outbox, Ambulance())
    try:
        assert actor.get("/emergency/status").json()["dispatch_available"] is True
    finally:
        app.state.engine.dispose()


def test_dispatch_needs_confirmation_and_real_coordinates(alice):
    for bad in ({**DISPATCH, "confirm": False}, {"latitude": LAT, "longitude": LON},
                {**DISPATCH, "latitude": 91}, {**DISPATCH, "longitude": -181}):
        assert alice.post("/emergency/dispatch-requests", json=bad).status_code == 422, bad


def test_accepted_only_when_the_provider_names_its_reference(settings, outbox):
    provider = Ambulance("AMB-123")
    actor, app = actor_with(settings, outbox, provider)
    try:
        r = actor.post("/emergency/dispatch-requests", json=DISPATCH)
        assert r.status_code == 201
        body = r.json()
        assert body["is_simulation"] is False and body["status"] == "accepted_by_provider"
        assert body["provider_reference"] == "AMB-123"
        assert "not a promise of arrival" in body["notice"]
        assert (provider.requests[0].latitude, provider.requests[0].longitude) == (LAT, LON)
    finally:
        app.state.engine.dispose()


@pytest.mark.parametrize(
    "ambulance", [Ambulance("   "), Ambulance(""), Ambulance(unavailable=True)]
)
def test_no_reference_or_no_provider_is_never_shown_as_accepted(settings, outbox, ambulance):
    actor, app = actor_with(settings, outbox, ambulance)
    try:
        r = actor.post("/emergency/dispatch-requests", json=DISPATCH)
        assert r.status_code == 503 and "accepted" not in r.text
    finally:
        app.state.engine.dispose()


def test_emergency_endpoints_need_login(app, outbox):
    visitor = Actor(app, outbox, "visitor@example.com")
    for method, path in (
        ("GET", "/emergency/status"),
        ("GET", "/emergency/summary"),
        ("GET", "/emergency/settings"),
        ("PUT", "/emergency/settings"),
        ("POST", "/emergency/simulations"),
        ("POST", "/emergency/dispatch-requests"),
    ):
        assert visitor.request(method, path, json={}).status_code == 401, path
