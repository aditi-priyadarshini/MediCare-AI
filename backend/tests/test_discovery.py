"""Phase 7: pharmacy and doctor discovery, stock reports, credentials, appointment requests.

The conftest truncates every table between tests, so each test builds the little directory it needs
(see `world`) instead of relying on the demo seed in migration 0006.
"""

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.audit.models import AuditLog
from app.discovery.models import Appointment, DoctorCredential
from app.discovery.providers import AppointmentSubmission, ProviderUnavailable
from app.identity.models import User
from app.main import create_app
from app.medications.models import Medicine
from tests.conftest import Actor


def iso(dt: datetime) -> str:
    return dt.isoformat()


NOW = datetime.now(UTC)
BBSR = (20.2961, 85.8245)  # an arbitrary point; every place below is invented


# ---------------------------------------------------------------------------- fixtures
@pytest.fixture
def admin(make_actor, db):
    actor = make_actor("curator@example.com")
    db.execute(
        User.__table__.update().where(User.email == "curator@example.com").values(role="admin")
    )
    db.commit()
    return actor


@pytest.fixture
def world(admin, db):
    """Sources, two medicines, and a small directory, all created through the admin API."""

    def source(name, kind, hours=24 * 180):
        r = admin.post(
            "/admin/provider-sources",
            json={
                "name": name,
                "kind": kind,
                "jurisdiction": "IN",
                "retrieved_on": date.today().isoformat(),
                "stale_after_hours": hours,
            },
        )
        assert r.status_code == 201, r.text
        return r.json()["id"]

    ids = {
        "dir": source("Test directory", "directory"),
        "inv": source("Test stock feed", "inventory", hours=24),
        "cred": source("Test council register", "credential"),
    }
    medicines = {}
    for name in ("Paracetamol", "Metformin"):
        m = Medicine(name=name, form="tablet", strength_text="500 mg", source="admin")
        db.add(m)
        db.flush()
        medicines[name] = str(m.id)
    db.commit()

    def pharmacy(name, city="Bhubaneswar", coords=None, observed=None, **extra):
        body = {
            "name": name,
            "address_line": "1 Test Road",
            "city": city,
            "source_id": ids["dir"],
            "source_observed_at": iso(observed or NOW - timedelta(hours=1)),
            **extra,
        }
        if coords:
            body["latitude"], body["longitude"] = coords
        r = admin.post("/admin/pharmacies", json=body)
        assert r.status_code == 201, r.text
        return r.json()["id"]

    def doctor(name, specialties=("general medicine",), city="Bhubaneswar", **extra):
        r = admin.post(
            "/admin/doctors",
            json={
                "display_name": name,
                "specialties": list(specialties),
                "city": city,
                "source_id": ids["dir"],
                "source_observed_at": iso(NOW - timedelta(hours=1)),
                **extra,
            },
        )
        assert r.status_code == 201, r.text
        return r.json()["id"]

    return {
        "src": ids,
        "med": medicines,
        "pharmacy": pharmacy,
        "doctor": doctor,
    }


def promote(db, email):
    db.execute(User.__table__.update().where(User.email == email).values(role="admin"))
    db.commit()


# ------------------------------------------------------------------------------- access
def test_discovery_requires_login(app, outbox):
    anon = Actor(app, outbox, "anon@example.com")
    for url in ("/pharmacies/search", "/doctors/search", "/appointments", "/doctors/specialties"):
        assert anon.get(url).status_code == 401, url


def test_patients_cannot_curate_the_directory(alice, world):
    body = {
        "name": "X",
        "kind": "directory",
        "jurisdiction": "IN",
        "stale_after_hours": 1,
        "retrieved_on": "2026-01-01",
    }
    assert alice.post("/admin/provider-sources", json=body).status_code == 403
    assert alice.post("/admin/pharmacies", json={}).status_code == 403
    assert alice.post(f"/admin/pharmacies/{uuid.uuid4()}/inventory", json={}).status_code == 403
    assert (
        alice.post(f"/admin/appointments/{uuid.uuid4()}/provider-response", json={}).status_code
        == 403
    )


# -------------------------------------------------------------------------- pharmacies
def test_search_filters_by_text_and_city_and_hides_retired(alice, admin, world):
    a = world["pharmacy"]("Alpha Chemist")
    world["pharmacy"]("Beta Pharmacy", city="Cuttack")
    gone = world["pharmacy"]("Alpha Retired")
    assert admin.post(f"/admin/pharmacies/{gone}/retire").status_code == 204

    names = lambda r: [p["name"] for p in r.json()["items"]]  # noqa: E731
    assert names(alice.get("/pharmacies/search")) == ["Alpha Chemist", "Beta Pharmacy"]
    assert names(alice.get("/pharmacies/search?q=alpha")) == ["Alpha Chemist"]
    assert names(alice.get("/pharmacies/search?city=cuttack")) == ["Beta Pharmacy"]
    assert alice.get(f"/pharmacies/{gone}").status_code == 404
    assert alice.get(f"/pharmacies/{a}").json()["name"] == "Alpha Chemist"


def test_search_treats_wildcards_literally(alice, world):
    world["pharmacy"]("Alpha Chemist")
    assert alice.get("/pharmacies/search?q=%25").json()["items"] == []
    assert alice.get("/pharmacies/search?q=_lpha").json()["items"] == []


def test_search_paginates(alice, world):
    for i in range(5):
        world["pharmacy"](f"Pharmacy {i}")
    page = alice.get("/pharmacies/search?limit=2&offset=2").json()
    assert page["total"] == 5 and len(page["items"]) == 2
    assert [p["name"] for p in page["items"]] == ["Pharmacy 2", "Pharmacy 3"]


def test_distance_search_sorts_nearest_first_and_respects_radius(alice, world):
    far = world["pharmacy"]("Far Away", coords=(20.46, 85.88))  # ~19 km
    near = world["pharmacy"]("Near By", coords=(20.30, 85.83))  # <1 km
    world["pharmacy"]("No Location")  # cannot be placed, so it is not shown by distance
    world["pharmacy"]("Other City", coords=(28.61, 77.20))  # ~1,200 km

    r = alice.get(f"/pharmacies/search?lat={BBSR[0]}&lon={BBSR[1]}&radius_km=50").json()
    assert [p["id"] for p in r["items"]] == [near, far]
    assert r["items"][0]["distance_km"] < 1.5 and 15 < r["items"][1]["distance_km"] < 25
    narrow = alice.get(f"/pharmacies/search?lat={BBSR[0]}&lon={BBSR[1]}&radius_km=5").json()
    assert [p["id"] for p in narrow["items"]] == [near]
    # Without a location the distance is simply absent, never invented.
    assert alice.get("/pharmacies/search").json()["items"][0]["distance_km"] is None


def test_location_needs_both_coordinates_and_valid_ranges(alice):
    assert alice.get("/pharmacies/search?lat=20").status_code == 422
    assert alice.get("/doctors/search?lon=85").status_code == 422
    assert alice.get("/pharmacies/search?lat=95&lon=0").status_code == 422


def test_location_is_not_written_to_logs_or_audit(alice, world, log_capture, db):
    world["pharmacy"]("Alpha Chemist", coords=(20.296100, 85.824500))
    alice.get("/pharmacies/search?lat=20.123457&lon=85.987654")
    # Only the server's own loggers: the test client (httpx) logs the URL it requests.
    app_logs = [r for r in log_capture if r.name.startswith("app")]
    assert any(r.name == "app.request" for r in app_logs)
    dumped = " ".join(str(r.__dict__) + r.getMessage() for r in app_logs)
    assert "20.123457" not in dumped and "85.987654" not in dumped
    assert not [a for a in db.scalars(select(AuditLog)) if "20.123457" in str(a.event_metadata)]


def test_every_listing_names_its_source_and_age(alice, world):
    world["pharmacy"]("Fresh Chemist", observed=NOW - timedelta(hours=3))
    world["pharmacy"]("Old Chemist", observed=NOW - timedelta(days=400))
    items = {p["name"]: p for p in alice.get("/pharmacies/search").json()["items"]}
    fresh, old = items["Fresh Chemist"], items["Old Chemist"]
    assert fresh["source"]["name"] == "Test directory"
    assert fresh["freshness"]["state"] == "fresh" and "3 hours ago" in fresh["freshness"]["label"]
    assert old["freshness"]["state"] == "stale"
    assert "May be out of date" in old["freshness"]["label"] and old["freshness"]["age_days"] >= 399
    assert alice.get("/pharmacies/search").json()["notice"].startswith("Hours, stock and prices")


def test_hours_are_shown_only_as_the_source_gave_them(alice, world):
    pid = world["pharmacy"]("Alpha Chemist", hours_text="Mon-Sat 9-21 (as listed)")
    assert alice.get(f"/pharmacies/{pid}").json()["hours_text"] == "Mon-Sat 9-21 (as listed)"
    other = world["pharmacy"]("Beta Chemist")
    assert alice.get(f"/pharmacies/{other}").json()["hours_text"] is None


def test_pharmacy_input_validation(admin, world):
    base = {
        "name": "P",
        "address_line": "a",
        "city": "c",
        "source_id": world["src"]["dir"],
        "source_observed_at": iso(NOW),
    }
    bad = [
        {"latitude": 20.0},  # only one coordinate
        {"latitude": 91, "longitude": 0},
        {"phone": "call me maybe"},
        {"source_observed_at": iso(NOW + timedelta(days=3))},  # future
        {"source_observed_at": "2026-01-01T00:00:00"},  # no time zone
        {"source_id": world["src"]["inv"]},  # wrong kind of source
        {"source_id": str(uuid.uuid4())},  # unknown source
        {"unexpected": 1},
    ]
    for patch in bad:
        r = admin.post("/admin/pharmacies", json={**base, **patch})
        assert r.status_code == 422, patch


# ----------------------------------------------------------------------------- inventory
def feed(world, pharmacy_id, admin, *rows, source="inv"):
    return admin.post(
        f"/admin/pharmacies/{pharmacy_id}/inventory",
        json={"source_id": world["src"][source], "items": list(rows)},
    )


def row(world, medicine="Paracetamol", availability="in_stock", age_hours=2, **extra):
    return {
        "medicine_id": world["med"][medicine],
        "availability": availability,
        "source_timestamp": iso(NOW - timedelta(hours=age_hours)),
        **extra,
    }


def test_no_feed_means_call_to_confirm_never_a_guess(alice, world):
    pid = world["pharmacy"]("Alpha Chemist")
    inv = alice.get(f"/pharmacies/{pid}/inventory").json()
    assert inv["feed_available"] is False and inv["items"] == []
    assert "Call to confirm availability" in inv["message"]
    found = alice.get(f"/pharmacies/search?medicine_id={world['med']['Paracetamol']}").json()
    stock = found["items"][0]["stock"]
    assert stock["state"] == "no_feed" and stock["reported"] is None
    assert stock["call_to_confirm"] is True and "Call to confirm" in stock["message"]
    # Without a medicine in the query, no stock block is returned at all.
    assert alice.get("/pharmacies/search").json()["items"][0]["stock"] is None


def test_a_fresh_report_carries_source_and_time(alice, admin, world):
    pid = world["pharmacy"]("Alpha Chemist")
    r = feed(
        world,
        pid,
        admin,
        row(world, price_amount="12.50", currency="INR", pack_size_text="10 tablets"),
    )
    assert r.status_code == 201 and r.json() == {"accepted": 1}
    item = alice.get(f"/pharmacies/{pid}/inventory").json()["items"][0]
    stock = item["stock"]
    assert item["medicine"]["name"] == "Paracetamol"
    assert stock["reported"] == "in_stock" and stock["source_name"] == "Test stock feed"
    assert stock["freshness"]["state"] == "fresh" and stock["call_to_confirm"] is False
    assert float(stock["price_amount"]) == 12.5 and stock["currency"] == "INR"
    assert stock["pack_size_text"] == "10 tablets"


def test_a_stale_report_is_labelled_not_hidden(alice, admin, world):
    pid = world["pharmacy"]("Alpha Chemist")
    feed(world, pid, admin, row(world, age_hours=24 * 5))  # the feed's own policy is 24 hours
    stock = alice.get(f"/pharmacies/{pid}/inventory").json()["items"][0]["stock"]
    assert stock["reported"] == "in_stock"
    assert stock["freshness"]["state"] == "stale" and stock["call_to_confirm"] is True
    assert "May be out of date" in stock["message"] and "Call to confirm" in stock["message"]


def test_newest_report_wins_per_medicine(alice, admin, world):
    pid = world["pharmacy"]("Alpha Chemist")
    feed(world, pid, admin, row(world, availability="in_stock", age_hours=10))
    feed(world, pid, admin, row(world, availability="out_of_stock", age_hours=1))
    feed(world, pid, admin, row(world, "Metformin", availability="low_stock", age_hours=3))
    items = {
        i["medicine"]["name"]: i["stock"]["reported"]
        for i in alice.get(f"/pharmacies/{pid}/inventory").json()["items"]
    }
    assert items == {"Paracetamol": "out_of_stock", "Metformin": "low_stock"}
    one = alice.get(f"/pharmacies/{pid}/inventory?medicine_id={world['med']['Metformin']}").json()
    assert [i["medicine"]["name"] for i in one["items"]] == ["Metformin"]


def test_search_by_medicine_shows_each_pharmacy_its_own_stock(alice, admin, world):
    a = world["pharmacy"]("Alpha Chemist")
    world["pharmacy"]("Beta Chemist")
    feed(world, a, admin, row(world))
    found = alice.get(f"/pharmacies/search?medicine_id={world['med']['Paracetamol']}").json()
    by_name = {p["name"]: p["stock"]["state"] for p in found["items"]}
    assert by_name == {"Alpha Chemist": "reported", "Beta Chemist": "no_feed"}
    assert alice.get(f"/pharmacies/search?medicine_id={uuid.uuid4()}").status_code == 404


def test_inventory_feed_validation(admin, world):
    pid = world["pharmacy"]("Alpha Chemist")
    ok = row(world)
    cases = [
        (dict(ok, source_timestamp=iso(NOW + timedelta(hours=2))), "inv"),  # future
        (dict(ok, source_timestamp="2026-01-01T00:00:00"), "inv"),  # no time zone
        (dict(ok, availability="plenty"), "inv"),
        (dict(ok, price_amount="5"), "inv"),  # price without currency
        (dict(ok, price_amount="-1", currency="INR"), "inv"),
        (dict(ok, medicine_id=str(uuid.uuid4())), "inv"),  # unknown medicine
        (ok, "dir"),  # a directory source is not a stock source
    ]
    for payload, src in cases:
        assert feed(world, pid, admin, payload, source=src).status_code == 422, payload
    assert feed(world, pid, admin).status_code == 422  # empty feed
    assert feed(world, str(uuid.uuid4()), admin, ok).status_code == 404


def test_stock_for_a_retired_pharmacy_is_refused(admin, world):
    pid = world["pharmacy"]("Alpha Chemist")
    admin.post(f"/admin/pharmacies/{pid}/retire")
    assert feed(world, pid, admin, row(world)).status_code == 409


# ------------------------------------------------------------------------------ doctors
def credential(admin, doctor_id, **body):
    return admin.post(
        f"/admin/doctors/{doctor_id}/credentials", json={"qualification": "MBBS", **body}
    )


def test_doctor_search_filters_and_is_never_ranked(alice, admin, world):
    a = world["doctor"]("Dr Zed", ["cardiology"], languages=["Hindi", "English"])
    b = world["doctor"]("Dr Amy", ["general medicine", "Endocrinology"], city="Cuttack")
    credential(admin, a, status="source_listed")
    names = lambda url: [d["display_name"] for d in alice.get(url).json()["items"]]  # noqa: E731

    assert names("/doctors/search") == ["Dr Amy", "Dr Zed"]  # by name, not by anything else
    assert names("/doctors/search?specialty=Cardiology") == ["Dr Zed"]
    assert names("/doctors/search?specialty=endocrinology") == ["Dr Amy"]
    assert names("/doctors/search?city=cuttack") == ["Dr Amy"]
    assert names("/doctors/search?language=hindi") == ["Dr Zed"]
    assert names("/doctors/search?q=amy") == ["Dr Amy"]
    assert names("/doctors/search?verified_only=true") == []
    assert alice.get(f"/doctors/{b}").json()["display_name"] == "Dr Amy"
    assert "never ranked by quality" in alice.get("/doctors/search").json()["notice"]
    assert alice.get("/doctors/specialties").json() == [
        "cardiology",
        "endocrinology",
        "general medicine",
    ]


def test_credentials_default_to_unverified_and_say_so(alice, admin, world):
    d = world["doctor"]("Dr Amy")
    doc = alice.get(f"/doctors/{d}").json()
    assert doc["credential_status"] == "unverified" and doc["credentials"] == []
    assert doc["credential_label"] == "Not verified."

    credential(admin, d, registration_number="OD-12345678", issuing_authority="Test council")
    doc = alice.get(f"/doctors/{d}").json()
    assert doc["credential_status"] == "unverified"
    assert doc["credentials"][0]["status"] == "unverified"


def test_listed_is_not_verified(alice, admin, world):
    d = world["doctor"]("Dr Amy")
    credential(admin, d, status="source_listed")
    doc = alice.get(f"/doctors/{d}").json()
    assert doc["credential_status"] == "source_listed"
    assert "Not independently verified" in doc["credential_label"]
    assert alice.get("/doctors/search?verified_only=true").json()["items"] == []


def test_verified_needs_a_source_and_a_time(alice, admin, world):
    d = world["doctor"]("Dr Amy")
    assert credential(admin, d, status="verified").status_code == 422
    assert credential(admin, d, status="verified", verified_at=iso(NOW)).status_code == 422
    assert (
        credential(
            admin, d, status="verified", verification_source_id=world["src"]["cred"]
        ).status_code
        == 422
    )
    # provenance on a credential that is not verified is also refused
    assert credential(admin, d, status="source_listed", verified_at=iso(NOW)).status_code == 422
    # and the wrong kind of source is refused
    assert (
        credential(
            admin,
            d,
            status="verified",
            verification_source_id=world["src"]["dir"],
            verified_at=iso(NOW),
        ).status_code
        == 422
    )

    ok = credential(
        admin,
        d,
        status="verified",
        registration_number="OD-12345678",
        verification_source_id=world["src"]["cred"],
        verified_at=iso(NOW - timedelta(days=2)),
    )
    assert ok.status_code == 201
    doc = alice.get(f"/doctors/{d}").json()
    assert doc["credential_status"] == "verified"
    assert doc["credential_label"].startswith("Verified against Test council register on ")
    assert doc["credentials"][0]["verification_source"]["name"] == "Test council register"
    assert [x["id"] for x in alice.get("/doctors/search?verified_only=true").json()["items"]] == [d]


def test_database_itself_refuses_a_verified_credential_without_provenance(db, admin, world):
    d = world["doctor"]("Dr Amy")
    db.add(DoctorCredential(doctor_id=uuid.UUID(d), qualification="MBBS", status="verified"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_registration_numbers_are_masked_everywhere(alice, admin, world):
    d = world["doctor"]("Dr Amy")
    credential(admin, d, registration_number="OD-12345678")
    for url in (f"/doctors/{d}", "/doctors/search"):
        body = alice.get(url).text
        assert "OD-12345678" not in body and "12345678" not in body
    assert (
        alice.get(f"/doctors/{d}").json()["credentials"][0]["registration_masked"] == "•••••••5678"
    )


def test_registration_numbers_stay_out_of_the_audit_trail(admin, world, db):
    d = world["doctor"]("Dr Amy")
    credential(admin, d, registration_number="OD-12345678")
    assert "OD-12345678" not in " ".join(
        str(a.event_metadata) for a in db.scalars(select(AuditLog))
    )
    assert db.scalar(select(AuditLog).where(AuditLog.action == "admin.credential_add")) is not None


def test_doctors_by_distance(alice, world):
    near = world["doctor"]("Near", latitude=20.30, longitude=85.83)
    world["doctor"]("Far", latitude=28.61, longitude=77.20)
    r = alice.get(f"/doctors/search?lat={BBSR[0]}&lon={BBSR[1]}&radius_km=30").json()
    assert [d["id"] for d in r["items"]] == [near]


def test_retired_doctors_disappear(alice, admin, world):
    d = world["doctor"]("Dr Amy")
    assert admin.post(f"/admin/doctors/{d}/retire").status_code == 204
    assert alice.get(f"/doctors/{d}").status_code == 404
    assert alice.get("/doctors/search").json()["items"] == []


# ------------------------------------------------------------------------- appointments
def tomorrow(days=1):
    return (date.today() + timedelta(days=days)).isoformat()


def book(actor, doctor_id, **extra):
    return actor.post(
        "/appointments", json={"doctor_id": doctor_id, "preferred_date": tomorrow(), **extra}
    )


def test_a_request_only_booking_says_it_was_not_sent(alice, world):
    d = world["doctor"]("Dr Amy", phone="0674 000 0000")
    r = book(alice, d, preferred_window="morning", reason="Follow-up visit")
    assert r.status_code == 201
    appt = r.json()
    assert appt["status"] == "request_only" and appt["mode"] == "request_only"
    assert "NOT been sent" in appt["status_text"] and "0674 000 0000" in appt["status_text"]
    assert appt["provider_reference"] is None and appt["provider_responded_at"] is None
    assert appt["doctor"]["display_name"] == "Dr Amy"
    assert "saved in this app only" in alice.get(f"/doctors/{d}").json()["appointment_note"].lower()


def test_appointment_validation_and_duplicates(alice, world):
    d = world["doctor"]("Dr Amy")
    assert book(alice, d).status_code == 201
    dup = book(alice, d)
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "ALREADY_REQUESTED"
    assert book(alice, d, preferred_window="evening").status_code == 201  # a different slot is fine
    long_ago = alice.post(
        "/appointments",
        json={"doctor_id": d, "preferred_date": tomorrow(-30)},
    )
    assert long_ago.status_code == 422
    too_far = alice.post("/appointments", json={"doctor_id": d, "preferred_date": tomorrow(120)})
    assert too_far.status_code == 422
    assert book(alice, d, preferred_window="midnight").status_code == 422
    assert book(alice, d, reason="x" * 501).status_code == 422
    assert book(alice, str(uuid.uuid4())).status_code == 404
    assert (
        alice.post(
            "/appointments",
            json={"doctor_id": d, "preferred_date": tomorrow(2), "status": "confirmed"},
        ).status_code
        == 422
    )


def test_a_patient_cannot_book_a_retired_doctor(alice, admin, world):
    d = world["doctor"]("Dr Amy")
    admin.post(f"/admin/doctors/{d}/retire")
    assert book(alice, d).status_code == 404


def test_appointments_are_private_to_their_patient(alice, bob, world):
    d = world["doctor"]("Dr Amy")
    appt = book(alice, d, reason="private").json()
    assert bob.get(f"/appointments/{appt['id']}").status_code == 404
    assert bob.post(f"/appointments/{appt['id']}/cancel").status_code == 404
    assert bob.get("/appointments").json() == {"items": [], "total": 0, "limit": 50, "offset": 0}
    assert [a["id"] for a in alice.get("/appointments").json()["items"]] == [appt["id"]]


def test_cancel_is_honest_about_who_was_told(alice, world):
    d = world["doctor"]("Dr Amy")
    appt = book(alice, d).json()
    cancelled = alice.post(f"/appointments/{appt['id']}/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert "clinic was never notified" in cancelled.json()["status_text"]
    again = alice.post(f"/appointments/{appt['id']}/cancel")
    assert again.status_code == 409 and again.json()["error"]["code"] == "NOT_CANCELLABLE"
    # a cancelled slot can be requested again
    assert book(alice, d).status_code == 201


def test_open_requests_are_capped(alice, world):
    d = world["doctor"]("Dr Amy")
    for i in range(20):
        assert (
            alice.post(
                "/appointments",
                json={
                    "doctor_id": d,
                    "preferred_date": tomorrow(1 + i % 80),
                    "preferred_window": ["any", "morning", "afternoon", "evening"][i % 4],
                },
            ).status_code
            == 201
        ), i
    over = book(alice, d, preferred_window="any")
    assert over.status_code == 409 and over.json()["error"]["code"] == "APPOINTMENT_LIMIT"


def test_audit_holds_ids_and_mode_never_the_reason(alice, world, db):
    d = world["doctor"]("Dr Amy")
    appt = book(alice, d, reason="my secret reason").json()
    alice.post(f"/appointments/{appt['id']}/cancel")
    rows = list(db.scalars(select(AuditLog).where(AuditLog.action.like("appointment.%"))))
    assert {r.action for r in rows} == {"appointment.request", "appointment.cancel"}
    assert all("secret" not in str(r.event_metadata) for r in rows)


def test_nothing_is_confirmed_without_a_provider_response(alice, admin, world, db):
    d = world["doctor"]("Dr Amy")
    appt = book(alice, d).json()
    # the admin stand-in refuses a request-only appointment
    r = admin.post(
        f"/admin/appointments/{appt['id']}/provider-response",
        json={"provider_reference": "x", "outcome": "confirmed"},
    )
    assert r.status_code == 409
    # and the database refuses to hold a confirmed one with no provider response
    with pytest.raises(IntegrityError):
        db.execute(
            text("UPDATE appointments SET status='confirmed', mode='provider' WHERE id=:i"),
            {"i": appt["id"]},
        )
    db.rollback()
    with pytest.raises(IntegrityError):  # status and mode must agree
        db.execute(text("UPDATE appointments SET status='sent' WHERE id=:i"), {"i": appt["id"]})
    db.rollback()
    assert db.get(Appointment, uuid.UUID(appt["id"])).status == "request_only"


def test_provider_mode_without_an_integration_stores_nothing(alice, world, db):
    d = world["doctor"]("Dr Amy", booking_mode="provider")
    r = book(alice, d)
    assert r.status_code == 409 and r.json()["error"]["code"] == "PROVIDER_UNAVAILABLE"
    assert "call the clinic" in r.json()["error"]["message"].lower()
    assert db.scalar(select(Appointment)) is None


class FakeClinicSystem:
    def __init__(self):
        self.received: list[AppointmentSubmission] = []
        self.down = False

    def submit(self, submission):
        if self.down:
            raise ProviderUnavailable("down")
        self.received.append(submission)
        return f"REF-{len(self.received)}"


@pytest.fixture
def clinic():
    return FakeClinicSystem()


@pytest.fixture
def linked(settings, outbox, google, clinic, make_actor, db):
    """An app wired to a fake booking system, with a patient and an admin signed in."""
    application = create_app(settings, email=outbox, google=google, appointments=clinic)

    def actor(email):
        a = Actor(application, outbox, email)
        assert a.register().status_code == 201 and a.verify().status_code == 200
        return a

    patient, boss = actor("patient@example.com"), actor("boss@example.com")
    promote(db, "boss@example.com")
    yield patient, boss
    application.state.engine.dispose()


def test_provider_booking_is_sent_then_confirmed_only_after_a_response(linked, clinic, world):
    patient, boss = linked
    d = world["doctor"]("Dr Amy", booking_mode="provider")
    r = book(patient, d, reason="a private reason")
    assert r.status_code == 201
    appt = r.json()
    assert appt["status"] == "sent" and appt["provider_reference"] == "REF-1"
    assert "not confirmed yet" in appt["status_text"].lower()
    # the provider received only the minimum: no reason, no identity
    sub = clinic.received[0]
    assert set(vars(sub)) == {"appointment_id", "doctor_id", "preferred_date", "preferred_window"}

    wrong = boss.post(
        f"/admin/appointments/{appt['id']}/provider-response",
        json={"provider_reference": "REF-999", "outcome": "confirmed"},
    )
    assert wrong.status_code == 422
    assert patient.get(f"/appointments/{appt['id']}").json()["status"] == "sent"

    ok = boss.post(
        f"/admin/appointments/{appt['id']}/provider-response",
        json={"provider_reference": "REF-1", "outcome": "confirmed", "message": "See you then"},
    )
    assert ok.status_code == 204
    done = patient.get(f"/appointments/{appt['id']}").json()
    assert done["status"] == "confirmed" and done["provider_responded_at"] is not None
    assert (
        done["provider_message"] == "See you then"
        and "Confirmed by the clinic" in done["status_text"]
    )

    again = boss.post(
        f"/admin/appointments/{appt['id']}/provider-response",
        json={"provider_reference": "REF-1", "outcome": "declined"},
    )
    assert again.status_code == 409  # a response is recorded once


def test_a_declined_request_is_shown_as_declined(linked, world):
    patient, boss = linked
    d = world["doctor"]("Dr Amy", booking_mode="provider")
    appt = book(patient, d).json()
    boss.post(
        f"/admin/appointments/{appt['id']}/provider-response",
        json={"provider_reference": appt["provider_reference"], "outcome": "declined"},
    )
    got = patient.get(f"/appointments/{appt['id']}").json()
    assert got["status"] == "declined" and "could not accept" in got["status_text"]
    assert patient.post(f"/appointments/{appt['id']}/cancel").status_code == 409


def test_provider_outage_midway_stores_nothing(linked, clinic, world, db):
    patient, _ = linked
    d = world["doctor"]("Dr Amy", booking_mode="provider")
    clinic.down = True
    assert book(patient, d).status_code == 409
    assert db.scalar(select(Appointment)) is None


def test_cancelling_a_sent_request_does_not_claim_the_clinic_knows(linked, world):
    patient, _ = linked
    d = world["doctor"]("Dr Amy", booking_mode="provider")
    appt = book(patient, d).json()
    text_ = patient.post(f"/appointments/{appt['id']}/cancel").json()["status_text"]
    assert "Contact the clinic" in text_
