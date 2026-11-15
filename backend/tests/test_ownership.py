"""Release-blocking: cross-user (IDOR) isolation for every patient-owned resource."""

import uuid

from sqlalchemy import select

from app.patients.models import PatientCondition

COND = {"display_name": "Type 2 diabetes", "onset_date": "2020-01-01"}
ALLERGY = {"substance": "Penicillin", "reaction": "Rash", "severity": "moderate"}
CONTACT = {"name": "Ravi Das", "relationship": "Brother", "phone_e164": "+919876543210"}


def test_condition_lifecycle_and_server_controlled_fields(alice):
    c = alice.post("/conditions", json=COND)
    assert c.status_code == 201
    body = c.json()
    assert body["verification_status"] == "patient_reported" and body["status"] == "active"
    # Verification status and owner are never accepted from the client.
    assert (
        alice.post(
            "/conditions", json={**COND, "verification_status": "clinician_confirmed"}
        ).status_code
        == 422
    )
    assert (
        alice.post("/conditions", json={**COND, "patient_user_id": str(uuid.uuid4())}).status_code
        == 422
    )
    upd = alice.patch(
        f"/conditions/{body['id']}", json={"status": "resolved", "resolved_date": "2024-01-01"}
    )
    assert upd.status_code == 200 and upd.json()["status"] == "resolved"


def test_condition_date_validation(alice):
    resp = alice.post(
        "/conditions", json={**COND, "onset_date": "2024-01-01", "resolved_date": "2020-01-01"}
    )
    assert resp.status_code == 422
    cid = alice.post("/conditions", json=COND).json()["id"]
    assert (
        alice.patch(f"/conditions/{cid}", json={"resolved_date": "2019-01-01"}).status_code == 422
    )


def test_entered_in_error_hides_but_preserves_history(alice):
    cid = alice.post("/conditions", json=COND).json()["id"]
    alice.patch(f"/conditions/{cid}", json={"status": "entered_in_error"})
    assert alice.get("/conditions").json()["total"] == 0
    shown = alice.get("/conditions?include_archived=true").json()
    assert shown["total"] == 1 and shown["items"][0]["id"] == cid


def test_editing_confirmed_condition_resets_verification(alice, db):
    cid = alice.post("/conditions", json=COND).json()["id"]
    row = db.scalar(select(PatientCondition).where(PatientCondition.id == uuid.UUID(cid)))
    row.verification_status = "clinician_confirmed"
    db.commit()
    out = alice.patch(f"/conditions/{cid}", json={"display_name": "Type 1 diabetes"}).json()
    assert out["verification_status"] == "patient_reported"


def test_pagination_shape(alice):
    for i in range(3):
        alice.post("/conditions", json={"display_name": f"C{i}"})
    page = alice.get("/conditions?limit=2&offset=1").json()
    assert page["total"] == 3 and len(page["items"]) == 2
    assert page["limit"] == 2 and page["offset"] == 1
    assert alice.get("/conditions?limit=1000").status_code == 422


def test_other_patient_cannot_see_or_modify_conditions(alice, bob):
    cid = alice.post("/conditions", json=COND).json()["id"]
    assert bob.get("/conditions").json()["total"] == 0
    resp = bob.patch(f"/conditions/{cid}", json={"display_name": "tampered"})
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "RESOURCE_NOT_FOUND"
    # Identical to a UUID that never existed: ownership is not an existence oracle.
    ghost = bob.patch(f"/conditions/{uuid.uuid4()}", json={"display_name": "x"})
    assert (
        ghost.status_code == 404
        and ghost.json()["error"]["message"] == resp.json()["error"]["message"]
    )
    assert alice.get("/conditions").json()["items"][0]["display_name"] == COND["display_name"]


def test_other_patient_cannot_touch_allergies(alice, bob):
    aid = alice.post("/allergies", json=ALLERGY).json()["id"]
    assert bob.get("/allergies").json()["total"] == 0
    assert bob.patch(f"/allergies/{aid}", json={"status": "entered_in_error"}).status_code == 404
    assert alice.get("/allergies").json()["items"][0]["status"] == "active"


def test_allergy_rules(alice):
    a = alice.post("/allergies", json=ALLERGY).json()
    assert a["verification_status"] == "patient_reported" and a["source"] == "patient"
    assert (
        alice.post("/allergies", json={"substance": "Dust", "severity": "catastrophic"}).status_code
        == 422
    )
    assert alice.patch(f"/allergies/{a['id']}", json={"substance": None}).status_code == 422
    alice.patch(f"/allergies/{a['id']}", json={"status": "entered_in_error"})
    assert alice.get("/allergies").json()["total"] == 0


def test_other_patient_cannot_touch_emergency_contacts(alice, bob):
    cid = alice.post("/emergency/contacts", json=CONTACT).json()["id"]
    assert bob.get("/emergency/contacts").json()["total"] == 0
    assert bob.patch(f"/emergency/contacts/{cid}", json={"name": "x"}).status_code == 404
    assert bob.delete(f"/emergency/contacts/{cid}").status_code == 404
    assert alice.get("/emergency/contacts").json()["total"] == 1  # survived the delete attempt


def test_contact_validation_and_primary_exclusivity(alice):
    assert (
        alice.post("/emergency/contacts", json={**CONTACT, "phone_e164": "98765"}).status_code
        == 422
    )
    assert (
        alice.post("/emergency/contacts", json={**CONTACT, "email": "not-an-email"}).status_code
        == 422
    )
    first = alice.post("/emergency/contacts", json={**CONTACT, "is_primary": True}).json()
    second = alice.post(
        "/emergency/contacts", json={**CONTACT, "name": "Meera", "is_primary": True}
    ).json()
    items = {c["id"]: c for c in alice.get("/emergency/contacts").json()["items"]}
    assert items[first["id"]]["is_primary"] is False and items[second["id"]]["is_primary"] is True
    alice.patch(f"/emergency/contacts/{first['id']}", json={"is_primary": True})
    items = {c["id"]: c for c in alice.get("/emergency/contacts").json()["items"]}
    assert items[first["id"]]["is_primary"] is True and items[second["id"]]["is_primary"] is False


def test_contact_limit_and_delete(alice):
    ids = [
        alice.post("/emergency/contacts", json={**CONTACT, "name": f"P{i}"}).json()["id"]
        for i in range(10)
    ]
    over = alice.post("/emergency/contacts", json=CONTACT)
    assert over.status_code == 409 and over.json()["error"]["code"] == "LIMIT_REACHED"
    assert alice.delete(f"/emergency/contacts/{ids[0]}").status_code == 204
    assert alice.post("/emergency/contacts", json=CONTACT).status_code == 201


def test_contact_counts_toward_completeness(alice):
    alice.post("/emergency/contacts", json=CONTACT)
    assert alice.get("/profile").json()["completeness"] == 25


def test_patient_data_requires_login(app, outbox):
    from tests.conftest import Actor

    anon = Actor(app, outbox, "anon@example.com")
    for path in ("/conditions", "/allergies", "/emergency/contacts", "/consents"):
        assert anon.get(path).status_code == 401, path


def test_unverified_user_cannot_create_records(make_actor):
    u = make_actor(verified=False)
    assert u.post("/conditions", json=COND).status_code == 403
    assert u.post("/allergies", json=ALLERGY).status_code == 403
    assert u.post("/emergency/contacts", json=CONTACT).status_code == 403


def test_admin_has_no_default_access_to_patient_records(alice, make_actor, db):
    from app.identity.models import User

    alice.post("/conditions", json=COND)
    admin = make_actor("root@example.com")
    db.execute(User.__table__.update().where(User.email == "root@example.com").values(role="admin"))
    db.commit()
    assert admin.get("/conditions").json()["total"] == 0  # sees only their own (empty) records
    assert admin.get("/allergies").json()["total"] == 0
