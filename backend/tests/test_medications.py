"""Medications: ownership, the take/skip/undo rules, supply arithmetic, alerts and the worker.

Times are anchored to the real clock because the database stamps rows with its own now();
schedules use the UTC zone so slot arithmetic is deterministic. DST behaviour itself is pinned
down in test_schedule.py.
"""

import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select

from app.audit.models import AuditLog
from app.identity.models import User
from app.medications import worker
from app.medications.models import DoseLog, Medication, Medicine, Notification

EMAIL_SUBJECT = "You have a MediCare AI reminder"
MED = {"display_name": "Metformin", "dose_text": "500 mg", "units_per_dose": 1}


# ---------------------------------------------------------------------------- helpers
def make_med(actor, **over):
    r = actor.post("/medications", json={**MED, **over})
    assert r.status_code == 201, r.text
    return r.json()


def make_schedule(actor, med_id, **over):
    body = {
        "times": ["00:00", "08:00", "16:00"],
        "start_date": (today_utc() - timedelta(days=1)).isoformat(),
        "timezone": "UTC",
        **over,
    }
    r = actor.post(f"/medications/{med_id}/schedules", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def make_supply(actor, med_id, **over):
    r = actor.post(f"/medications/{med_id}/supplies", json={"quantity_initial": 30, **over})
    assert r.status_code == 201, r.text
    return r.json()


def window(days=3, back=0):
    now = datetime.now(UTC)
    return {
        "from": (now - timedelta(hours=back)).isoformat(),
        "to": (now + timedelta(days=days)).isoformat(),
        "limit": 100,
    }


def doses(actor, **kw):
    r = actor.get("/doses", params=window(**kw))
    assert r.status_code == 200, r.text
    return r.json()["items"]


def user_id(db, email):
    return db.scalar(select(User.id).where(User.email == email))


def add_dose(db, email, med_id, schedule_id, when):
    """A scheduled dose at an exact time, inserted directly (what the worker would create)."""
    dose = DoseLog(
        patient_user_id=user_id(db, email),
        medication_id=uuid.UUID(med_id),
        schedule_id=uuid.UUID(schedule_id),
        scheduled_at=when,
        status="pending",
    )
    db.add(dose)
    db.commit()
    return dose


def remaining(actor, med_id):
    rows = actor.get(f"/medications/{med_id}/supplies", params={"include_inactive": True}).json()
    return {s["lot_number"] or s["id"]: s["quantity_remaining"] for s in rows}


def as_utc(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(UTC)


def utc_hhmm(iso: str) -> str:
    return as_utc(iso).strftime("%H:%M")


def today_utc() -> date:
    return datetime.now(UTC).date()


def make_pack(actor, med_id, lot, qty, days, **over):
    """A supply that expires `days` from today (negative = already expired)."""
    expiry = (today_utc() + timedelta(days=days)).isoformat()
    return make_supply(
        actor, med_id, lot_number=lot, quantity_initial=qty, expiry_date=expiry, **over
    )


# ------------------------------------------------------------------ medications and basis
def test_basis_follows_the_prescription_link(alice):
    rx = alice.post("/prescriptions", json={"prescriber_name": "Dr Rao"}).json()
    stated = make_med(alice)
    assert stated["basis"] == "self_reported" and stated["prescription_id"] is None
    assert stated["verification_status"] == "patient_reported"
    prescribed = make_med(alice, prescription_id=rx["id"])
    assert prescribed["basis"] == "prescribed"
    cleared = alice.patch(f"/medications/{prescribed['id']}", json={"prescription_id": None})
    assert cleared.json()["basis"] == "self_reported"
    relinked = alice.patch(f"/medications/{prescribed['id']}", json={"prescription_id": rx["id"]})
    assert relinked.json()["basis"] == "prescribed"


def test_server_controlled_and_invalid_fields_are_rejected(alice):
    for extra in (
        {"basis": "prescribed"},
        {"verification_status": "clinician_confirmed"},
        {"patient_user_id": str(uuid.uuid4())},
        {"status": "stopped"},
        {"units_per_dose": 0},
        {"display_name": "   "},
        {"start_date": "2026-11-10", "end_date": "2026-11-01"},
        {"refill_threshold_days": 91},
    ):
        assert alice.post("/medications", json={**MED, **extra}).status_code == 422, extra
    unknown = {**MED, "medicine_id": str(uuid.uuid4())}
    assert alice.post("/medications", json=unknown).status_code == 422


def test_editing_content_resets_verification(alice, db):
    med = make_med(alice)
    db.execute(
        Medication.__table__.update()
        .where(Medication.id == uuid.UUID(med["id"]))
        .values(verification_status="clinician_confirmed")
    )
    db.commit()
    same = alice.patch(f"/medications/{med['id']}", json={"display_name": "Metformin"}).json()
    assert same["verification_status"] == "clinician_confirmed"
    edited = alice.patch(f"/medications/{med['id']}", json={"dose_text": "850 mg"}).json()
    assert edited["verification_status"] == "patient_reported"


def test_medication_can_link_to_a_catalogue_entry(alice, db):
    entry = Medicine(name="Testamol", form="tablet", strength_text="10 mg", source="admin")
    db.add(entry)
    db.commit()
    med = make_med(alice, medicine_id=str(entry.id))
    assert med["medicine_id"] == str(entry.id)


# ------------------------------------------------------------------------------ ownership
def test_other_patients_cannot_touch_medication_data(alice, bob):
    med = make_med(alice)
    sched = make_schedule(alice, med["id"])
    supply = make_supply(alice, med["id"])
    rx = alice.post("/prescriptions", json={}).json()
    dose = doses(alice)[0]
    mid, sid, uid, rid, did = med["id"], sched["id"], supply["id"], rx["id"], dose["id"]
    attempts = [
        ("GET", f"/medications/{mid}", None),
        ("PATCH", f"/medications/{mid}", {"reason": "x"}),
        ("GET", f"/medications/{mid}/schedules", None),
        ("POST", f"/medications/{mid}/schedules", {"times": ["09:00"], "start_date": "2026-11-15"}),
        ("PATCH", f"/schedules/{sid}", {"is_active": False}),
        ("GET", f"/medications/{mid}/supplies", None),
        ("POST", f"/medications/{mid}/supplies", {"quantity_initial": 5}),
        ("PATCH", f"/supplies/{uid}", {"quantity_remaining": 1}),
        ("GET", f"/prescriptions/{rid}", None),
        ("PATCH", f"/prescriptions/{rid}", {"notes": "x"}),
        ("POST", f"/doses/{did}/take", {}),
        ("POST", f"/doses/{did}/skip", {}),
        ("POST", f"/doses/{did}/reset", None),
        ("DELETE", f"/doses/{did}", None),
    ]
    for method, path, body in attempts:
        resp = bob.request(method, path, json=body)
        assert resp.status_code == 404, (method, path, resp.status_code)
    assert bob.post("/medications", json={**MED, "prescription_id": rid}).status_code == 404
    assert bob.post("/doses", json={"medication_id": mid}).status_code == 404
    assert bob.get("/medications").json()["total"] == 0
    assert doses(bob) == []
    assert bob.get("/medications/alerts").json() == []
    # Nothing of Alice's changed.
    assert alice.get(f"/medications/{mid}").json()["reason"] is None
    assert [d for d in doses(alice) if d["id"] == did][0]["status"] == "pending"


def test_medication_endpoints_need_a_verified_session(app, outbox, make_actor):
    from tests.conftest import Actor

    anon = Actor(app, outbox, "anon@example.com")
    unverified = make_actor("unverified@example.com", verified=False)
    paths = ("/medications", "/doses", "/notifications", "/medications/alerts", "/prescriptions")
    for path in paths:
        assert anon.get(path).status_code == 401, path
        resp = unverified.get(path)
        assert resp.status_code == 403, path
        assert resp.json()["error"]["code"] == "EMAIL_NOT_VERIFIED"


# ------------------------------------------------------------------------------ schedules
def test_schedule_defaults_to_profile_timezone_and_normalises_times(alice):
    med = make_med(alice)
    r = alice.post(
        f"/medications/{med['id']}/schedules",
        json={"times": ["20:00", "08:00", "08:00"], "start_date": today_utc().isoformat()},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["timezone"] == "Asia/Kolkata"
    assert body["times"] == ["08:00", "20:00"]
    assert body["is_active"] is True


def test_invalid_schedules_are_rejected(alice):
    med = make_med(alice)
    today = today_utc().isoformat()
    base = {"times": ["08:00"], "start_date": today}
    for extra in (
        {"timezone": "Mars/Base"},
        {"times": ["8:00"]},
        {"times": ["25:00"]},
        {"times": []},
        {"days_of_week": [7]},
        {"days_of_week": []},
        {"every_n_days": 2, "days_of_week": [1]},
        {"every_n_days": 0},
        {"end_date": (today_utc() - timedelta(days=3)).isoformat()},
        {"is_active": False},
    ):
        resp = alice.post(f"/medications/{med['id']}/schedules", json={**base, **extra})
        assert resp.status_code == 422, extra


def test_schedule_creates_pending_doses_that_are_never_taken_automatically(
    alice, db, outbox, settings
):
    med = make_med(alice)
    make_schedule(alice, med["id"])
    items = doses(alice)
    assert 5 <= len(items) <= 7  # three a day over the 48 hour horizon
    assert {d["status"] for d in items} == {"pending"}
    assert all(d["taken_at"] is None and d["overdue"] is False for d in items)
    # Even a worker running days later only ever creates pending doses.
    worker.tick(db, datetime.now(UTC) + timedelta(days=5), outbox, settings)
    taken = select(func.count()).select_from(DoseLog).where(DoseLog.status == "taken")
    assert db.scalar(taken) == 0


def test_editing_a_schedule_replaces_only_future_pending_doses(alice):
    med = make_med(alice)
    sched = make_schedule(alice, med["id"])
    first = doses(alice)[0]
    assert alice.post(f"/doses/{first['id']}/take", json={}).status_code == 200
    r = alice.patch(f"/schedules/{sched['id']}", json={"times": ["12:00"]})
    assert r.status_code == 200 and r.json()["times"] == ["12:00"]
    after = doses(alice)
    kept = [d for d in after if d["id"] == first["id"]]
    assert kept and kept[0]["status"] == "taken"
    pending = [d for d in after if d["status"] == "pending"]
    assert pending and all(utc_hhmm(d["scheduled_at"]) == "12:00" for d in pending)


def test_schedule_edit_validation_and_deactivation(alice):
    med = make_med(alice)
    sched = make_schedule(alice, med["id"])
    sid = sched["id"]
    assert alice.patch(f"/schedules/{sid}", json={"times": None}).status_code == 422
    both = {"every_n_days": 2, "days_of_week": [1]}
    assert alice.patch(f"/schedules/{sid}", json=both).status_code == 422
    assert alice.patch(f"/schedules/{sid}", json={"every_n_days": 3}).status_code == 200
    weekdays = {"days_of_week": [1]}  # not allowed while the interval is 3 days
    assert alice.patch(f"/schedules/{sid}", json=weekdays).status_code == 422
    off = alice.patch(f"/schedules/{sid}", json={"is_active": False}).json()
    assert off["is_active"] is False
    assert [d for d in doses(alice) if d["status"] == "pending"] == []


def test_pausing_removes_future_doses_and_resuming_restores_them_without_backfill(alice):
    med = make_med(alice)
    make_schedule(alice, med["id"])
    assert doses(alice)
    assert alice.patch(f"/medications/{med['id']}", json={"status": "paused"}).status_code == 200
    assert [d for d in doses(alice) if d["status"] == "pending"] == []
    assert alice.patch(f"/medications/{med['id']}", json={"status": "active"}).status_code == 200
    after = doses(alice)
    assert after and all(d["overdue"] is False for d in after)
    cutoff = datetime.now(UTC) - timedelta(seconds=5)
    assert all(as_utc(d["scheduled_at"]) >= cutoff for d in after)


def test_stopped_medications_cannot_get_new_schedules(alice):
    med = make_med(alice)
    alice.patch(f"/medications/{med['id']}", json={"status": "stopped"})
    r = alice.post(
        f"/medications/{med['id']}/schedules",
        json={"times": ["08:00"], "start_date": today_utc().isoformat()},
    )
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "MEDICATION_INACTIVE"


def test_medication_end_date_clips_the_schedule(alice):
    med = make_med(alice, end_date=today_utc().isoformat())
    make_schedule(alice, med["id"], times=["23:59"])
    items = doses(alice, days=4)
    assert all(utc_hhmm(d["scheduled_at"]) == "23:59" for d in items)
    assert len(items) <= 1  # at most today's slot; nothing after the end date


# --------------------------------------------------------------------------- dose actions
def test_take_skip_and_undo_rules(alice):
    med = make_med(alice)
    supply = make_supply(alice, med["id"], quantity_initial=10)
    make_schedule(alice, med["id"])
    dose = doses(alice)[0]
    did = dose["id"]

    taken = alice.post(f"/doses/{did}/take", json={"note": "with food"})
    assert taken.status_code == 200
    body = taken.json()
    assert body["status"] == "taken" and body["taken_at"] and body["note"] == "with food"
    assert body["supply_id"] == supply["id"] and body["units_used"] == 1
    assert remaining(alice, med["id"]) == {supply["id"]: 9}

    again = alice.post(f"/doses/{did}/take", json={})
    assert again.status_code == 409 and again.json()["error"]["code"] == "DOSE_ALREADY_LOGGED"
    assert alice.post(f"/doses/{did}/skip", json={}).status_code == 409

    reset = alice.post(f"/doses/{did}/reset").json()
    assert reset["status"] == "pending" and reset["taken_at"] is None
    assert reset["supply_id"] is None and reset["units_used"] is None
    assert remaining(alice, med["id"]) == {supply["id"]: 10}

    skipped = alice.post(f"/doses/{did}/skip", json={"note": "felt sick"}).json()
    assert skipped["status"] == "skipped" and skipped["taken_at"] is None
    assert remaining(alice, med["id"]) == {supply["id"]: 10}
    assert alice.post(f"/doses/{did}/take", json={}).json()["status"] == "taken"


def test_a_dose_cannot_be_logged_as_taken_in_the_future(alice):
    med = make_med(alice)
    make_schedule(alice, med["id"])
    did = doses(alice)[0]["id"]
    future = (datetime.now(UTC) + timedelta(hours=2)).isoformat()
    assert alice.post(f"/doses/{did}/take", json={"taken_at": future}).status_code == 422
    naive = {"taken_at": "2026-11-15T08:00:00"}
    assert alice.post(f"/doses/{did}/take", json=naive).status_code == 422
    earlier = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    assert alice.post(f"/doses/{did}/take", json={"taken_at": earlier}).status_code == 200


def test_taking_without_a_recorded_supply_still_works(alice):
    med = make_med(alice)
    make_schedule(alice, med["id"])
    body = alice.post(f"/doses/{doses(alice)[0]['id']}/take", json={}).json()
    assert body["status"] == "taken" and body["supply_id"] is None and body["units_used"] is None


def test_overdue_is_derived_not_stored(alice, db):
    med = make_med(alice)
    sched = make_schedule(alice, med["id"], times=["03:17"])
    now = datetime.now(UTC)
    late = add_dose(db, "alice@example.com", med["id"], sched["id"], now - timedelta(hours=2))
    recent = add_dose(db, "alice@example.com", med["id"], sched["id"], now - timedelta(minutes=20))
    by_id = {d["id"]: d for d in doses(alice, back=24)}
    assert by_id[str(late.id)]["overdue"] is True
    assert by_id[str(recent.id)]["overdue"] is False
    db.refresh(late)
    assert late.status == "pending"  # nothing flipped it


def test_extra_doses_are_logged_by_when_they_were_taken(alice):
    med = make_med(alice, as_needed=True)
    supply = make_supply(alice, med["id"], quantity_initial=10)
    r = alice.post("/doses", json={"medication_id": med["id"], "note": "headache"})
    assert r.status_code == 201
    body = r.json()
    assert body["scheduled_at"] is None and body["status"] == "taken" and body["taken_at"]
    assert body["medication_name"] == "Metformin" and body["dose_text"] == "500 mg"
    assert [d["id"] for d in doses(alice, back=1)] == [body["id"]]
    future = (datetime.now(UTC) + timedelta(hours=1)).isoformat()
    too_early = {"medication_id": med["id"], "taken_at": future}
    assert alice.post("/doses", json=too_early).status_code == 422
    assert remaining(alice, med["id"]) == {supply["id"]: 9}
    # A mistaken extra dose can be deleted and returns its stock; it cannot be "reset".
    assert alice.post(f"/doses/{body['id']}/reset").status_code == 409
    assert alice.delete(f"/doses/{body['id']}").status_code == 204
    assert remaining(alice, med["id"]) == {supply["id"]: 10}
    assert doses(alice, back=1) == []


def test_scheduled_doses_cannot_be_deleted(alice):
    med = make_med(alice)
    make_schedule(alice, med["id"])
    resp = alice.delete(f"/doses/{doses(alice)[0]['id']}")
    assert resp.status_code == 409 and resp.json()["error"]["code"] == "NOT_DELETABLE"


def test_dose_window_is_validated(alice):
    now = datetime.now(UTC)
    bad = [
        {"from": now.isoformat(), "to": (now - timedelta(hours=1)).isoformat()},
        {"from": now.isoformat(), "to": (now + timedelta(days=90)).isoformat()},
    ]
    for params in bad:
        assert alice.get("/doses", params=params).status_code == 422


# -------------------------------------------------------------------------------- supplies
def test_stock_comes_from_the_earliest_expiring_usable_supply(alice):
    med = make_med(alice, units_per_dose=2)
    make_pack(alice, med["id"], "OLD", 10, -2)
    make_pack(alice, med["id"], "LATE", 10, 200)
    make_pack(alice, med["id"], "SOON", 1, 60)

    first = alice.post("/doses", json={"medication_id": med["id"]}).json()
    assert first["units_used"] == 1  # only one unit was left in the earliest usable pack
    assert remaining(alice, med["id"]) == {"OLD": 10, "LATE": 10, "SOON": 0}
    second = alice.post("/doses", json={"medication_id": med["id"]}).json()
    assert second["units_used"] == 2
    assert remaining(alice, med["id"]) == {"OLD": 10, "LATE": 8, "SOON": 0}
    assert alice.delete(f"/doses/{second['id']}").status_code == 204
    assert remaining(alice, med["id"])["LATE"] == 10


def test_supply_validation_and_manual_count(alice):
    med = make_med(alice)
    bad = [
        {"quantity_initial": 0},
        {"quantity_initial": 10, "quantity_remaining": 11},
        {"quantity_initial": 10, "quantity_remaining": -1},
        {"quantity_initial": 10, "expiry_date": "1800-01-01"},
    ]
    for body in bad:
        assert alice.post(f"/medications/{med['id']}/supplies", json=body).status_code == 422, body
    supply = make_supply(alice, med["id"], lot_number="B123", manufacturer="Acme")
    assert supply["quantity_remaining"] == 30 and supply["lot_number"] == "B123"
    fixed = alice.patch(f"/supplies/{supply['id']}", json={"quantity_remaining": 4})
    assert fixed.json()["quantity_remaining"] == 4
    too_many = {"quantity_remaining": 31}
    assert alice.patch(f"/supplies/{supply['id']}", json=too_many).status_code == 422
    discard = {"status": "discarded"}
    assert alice.patch(f"/supplies/{supply['id']}", json=discard).status_code == 200
    url = f"/medications/{med['id']}/supplies"
    assert alice.get(url).json() == []
    assert len(alice.get(url, params={"include_inactive": True}).json()) == 1


# ---------------------------------------------------------------------------------- alerts
def kinds(actor):
    return sorted(a["kind"] for a in actor.get("/medications/alerts").json())


def test_refill_alert_uses_the_schedule_and_the_threshold(alice):
    med = make_med(alice, refill_threshold_days=7)
    make_schedule(alice, med["id"], times=["08:00", "20:00"])  # two units a day
    assert kinds(alice) == []  # no stock recorded, so nothing to project
    low = make_supply(alice, med["id"], quantity_initial=10)
    alert = alice.get("/medications/alerts").json()[0]
    assert alert["kind"] == "refill_soon" and alert["medication_id"] == med["id"]
    assert alert["days_left"] == 5
    make_supply(alice, med["id"], quantity_initial=100)
    assert kinds(alice) == []  # 110 units is 55 days
    alice.patch(f"/supplies/{low['id']}", json={"status": "discarded"})
    assert kinds(alice) == []


def test_out_of_stock_alert_when_every_supply_is_empty(alice):
    med = make_med(alice)
    make_schedule(alice, med["id"])
    supply = make_supply(alice, med["id"], quantity_initial=5)
    alice.patch(f"/supplies/{supply['id']}", json={"quantity_remaining": 0})
    assert kinds(alice) == ["out_of_stock"]


def test_expiry_alerts_for_soon_and_past_dates(alice):
    med = make_med(alice, as_needed=True)  # as-needed: no stock projection, expiry still checked
    make_pack(alice, med["id"], "SOON", 10, 10)
    make_pack(alice, med["id"], "GONE", 10, -3)
    make_pack(alice, med["id"], "FINE", 10, 400)
    make_pack(alice, med["id"], "EMPTY", 10, -3, quantity_remaining=0)
    by_lot = {a["lot_number"]: a["kind"] for a in alice.get("/medications/alerts").json()}
    assert by_lot == {"SOON": "expiring_soon", "GONE": "expired"}


def test_paused_medications_raise_no_alerts(alice):
    med = make_med(alice)
    make_schedule(alice, med["id"])
    make_supply(alice, med["id"], quantity_initial=2)
    assert kinds(alice) == ["refill_soon"]
    alice.patch(f"/medications/{med['id']}", json={"status": "paused"})
    assert kinds(alice) == []


# ----------------------------------------------------------------------------------- worker
def notifications(db, **where):
    stmt = select(Notification)
    for key, value in where.items():
        stmt = stmt.where(getattr(Notification, key) == value)
    return db.scalars(stmt).all()


def test_worker_makes_one_reminder_per_due_dose_and_is_idempotent(alice, db, outbox, settings):
    med = make_med(alice)
    sched = make_schedule(alice, med["id"])
    now = datetime.now(UTC)
    dose = add_dose(db, "alice@example.com", med["id"], sched["id"], now - timedelta(minutes=30))

    first = worker.tick(db, now, outbox, settings)
    second = worker.tick(db, now, outbox, settings)
    assert first.notifications_created >= 1 and first.delivered >= 1
    assert second.notifications_created == 0 and second.doses_created == 0 and second.delivered == 0
    assert len(notifications(db, dose_log_id=dose.id)) == 1

    feed = alice.get("/notifications").json()
    assert feed["total"] == 1
    item = feed["items"][0]
    assert item["kind"] == "dose_due" and item["title"] == "Time to take Metformin"
    assert item["read_at"] is None and item["delivered_at"] is not None
    assert alice.get("/notifications/unread-count").json() == {"count": 1}

    # Reminding never records a dose.
    db.refresh(dose)
    assert dose.status == "pending" and dose.taken_at is None

    # Only the patient's own action does, and it clears the reminder.
    assert alice.post(f"/doses/{dose.id}/take", json={}).status_code == 200
    assert alice.get("/notifications/unread-count").json() == {"count": 0}
    assert worker.tick(db, now + timedelta(minutes=5), outbox, settings).notifications_created == 0


def test_no_reminders_for_old_doses_or_inactive_medications(alice, db, outbox, settings):
    med = make_med(alice)
    other = make_med(alice, display_name="Aspirin")
    sched = make_schedule(alice, med["id"], times=["03:17"])
    other_sched = make_schedule(alice, other["id"], times=["03:17"])
    now = datetime.now(UTC)
    add_dose(db, "alice@example.com", med["id"], sched["id"], now - timedelta(hours=30))
    add_dose(db, "alice@example.com", other["id"], other_sched["id"], now - timedelta(minutes=10))
    alice.patch(f"/medications/{other['id']}", json={"status": "paused"})
    worker.tick(db, now, outbox, settings)
    assert notifications(db, kind="dose_due") == []


def test_skipping_clears_the_reminder(alice, db, outbox, settings):
    med = make_med(alice)
    sched = make_schedule(alice, med["id"], times=["03:17"])
    now = datetime.now(UTC)
    dose = add_dose(db, "alice@example.com", med["id"], sched["id"], now - timedelta(minutes=5))
    worker.tick(db, now, outbox, settings)
    assert alice.get("/notifications/unread-count").json() == {"count": 1}
    alice.post(f"/doses/{dose.id}/skip", json={})
    assert alice.get("/notifications/unread-count").json() == {"count": 0}


def test_notification_feed_read_state_and_ownership(alice, bob, db, outbox, settings):
    med = make_med(alice)
    sched = make_schedule(alice, med["id"], times=["03:17"])
    now = datetime.now(UTC)
    add_dose(db, "alice@example.com", med["id"], sched["id"], now - timedelta(minutes=5))
    add_dose(db, "alice@example.com", med["id"], sched["id"], now - timedelta(minutes=15))
    worker.tick(db, now, outbox, settings)
    items = alice.get("/notifications", params={"unread_only": True}).json()["items"]
    assert len(items) == 2
    nid = items[0]["id"]
    assert bob.post(f"/notifications/{nid}/read").status_code == 404
    assert bob.get("/notifications").json()["total"] == 0
    assert alice.post(f"/notifications/{nid}/read").json()["read_at"] is not None
    assert alice.get("/notifications/unread-count").json() == {"count": 1}
    assert alice.post("/notifications/read-all").status_code == 204
    assert alice.get("/notifications/unread-count").json() == {"count": 0}
    assert alice.get("/notifications").json()["total"] == 2


def test_refill_and_expiry_notifications_do_not_repeat_within_their_window(
    alice, db, outbox, settings
):
    med = make_med(alice)
    make_schedule(alice, med["id"], times=["08:00", "20:00"])
    make_pack(alice, med["id"], "L1", 10, 10)
    now = datetime.now(UTC)
    worker.tick(db, now, outbox, settings)
    worker.tick(db, now, outbox, settings)
    assert len(notifications(db, kind="refill_soon")) == 1
    assert len(notifications(db, kind="expiring_soon")) == 1
    # A week later the refill reminder repeats; the one-off expiry reminder does not.
    worker.tick(db, now + timedelta(days=8), outbox, settings)
    assert len(notifications(db, kind="refill_soon")) == 2
    assert len(notifications(db, kind="expiring_soon")) == 1


def test_reminder_email_needs_consent_and_never_names_the_medicine(alice, db, outbox, settings):
    med = make_med(alice, display_name="Secretdrug")
    sched = make_schedule(alice, med["id"], times=["03:17"])
    now = datetime.now(UTC)

    def reminder_mails():
        return [m for m in outbox.outbox if m.subject == EMAIL_SUBJECT]

    add_dose(db, "alice@example.com", med["id"], sched["id"], now - timedelta(minutes=30))
    assert worker.tick(db, now, outbox, settings).emails_sent == 0
    assert reminder_mails() == []

    assert alice.put("/consents/reminder_email", json={"granted": True}).status_code == 200
    assert worker.tick(db, now, outbox, settings).emails_sent == 1
    mails = reminder_mails()
    assert len(mails) == 1 and mails[0].to == "alice@example.com"
    assert "Secretdrug" not in mails[0].body and "Secretdrug" not in mails[0].subject
    assert worker.tick(db, now, outbox, settings).emails_sent == 0  # already sent

    alice.put("/consents/reminder_email", json={"granted": False})
    add_dose(db, "alice@example.com", med["id"], sched["id"], now - timedelta(minutes=10))
    assert worker.tick(db, now, outbox, settings).emails_sent == 0
    assert len(reminder_mails()) == 1


def test_one_email_covers_several_reminders(alice, db, outbox, settings):
    med = make_med(alice)
    sched = make_schedule(alice, med["id"], times=["03:17"])
    alice.put("/consents/reminder_email", json={"granted": True})
    now = datetime.now(UTC)
    for minutes in (10, 20, 30):
        add_dose(db, "alice@example.com", med["id"], sched["id"], now - timedelta(minutes=minutes))
    assert worker.tick(db, now, outbox, settings).emails_sent == 1
    assert len([m for m in outbox.outbox if m.subject == EMAIL_SUBJECT]) == 1


# ---------------------------------------------------------------------- catalogue / admin
def test_catalogue_search_is_safe_and_case_insensitive(alice, db):
    db.add_all(
        [
            Medicine(name="Testamol", form="tablet", strength_text="500 mg", source="seed"),
            Medicine(name="Testamol", form="syrup", strength_text="120 mg/5 ml", source="seed"),
            Medicine(name="Other", form="tablet", strength_text=None, source="seed"),
        ]
    )
    db.commit()
    found = alice.get("/medicines", params={"q": "TESTA"}).json()
    assert [m["form"] for m in found] == ["syrup", "tablet"]
    assert all(m["name"] == "Testamol" for m in found)
    assert alice.get("/medicines", params={"q": "%%"}).json() == []
    assert alice.get("/medicines", params={"q": "a"}).status_code == 422


def test_only_admins_can_extend_the_catalogue(alice, make_actor, db):
    body = {"name": "Zincovit", "form": "tablet", "strength_text": "1 tab"}
    assert alice.post("/admin/medicines", json=body).status_code == 403
    admin = make_actor("boss@example.com")
    db.execute(User.__table__.update().where(User.email == "boss@example.com").values(role="admin"))
    db.commit()
    assert admin.post("/admin/medicines", json=body).status_code == 201
    assert admin.post("/admin/medicines", json={**body, "name": "ZINCOVIT"}).status_code == 409
    assert [m["name"] for m in alice.get("/medicines", params={"q": "zinc"}).json()] == ["Zincovit"]
    assert db.scalar(select(AuditLog).where(AuditLog.action == "admin.medicine_create")) is not None


# ---------------------------------------------------------------------------------- audit
def test_actions_are_audited_without_medical_content(alice, db):
    med = make_med(alice, display_name="Secretdrug", reason="private reason")
    make_schedule(alice, med["id"])
    alice.post(f"/doses/{doses(alice)[0]['id']}/take", json={"note": "private note"})
    rows = db.scalars(select(AuditLog)).all()
    actions = {r.action for r in rows}
    assert {"medication.create", "schedule.create", "dose.take"} <= actions
    blob = " ".join(f"{r.resource_type} {r.resource_id} {r.event_metadata}" for r in rows)
    assert "Secretdrug" not in blob and "private" not in blob
