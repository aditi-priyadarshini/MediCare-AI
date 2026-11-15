"""Phase 4: curated safety checks, alternatives and prices, authenticity, adverse events.

The conftest truncates every table between tests, so each test builds the small reference
dataset it needs (see `ref`) instead of relying on the demo seed in migration 0004.
"""

import json
import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import select

from app.audit.models import AuditLog
from app.identity.models import User
from app.medications.models import Medicine
from app.safety import authenticity as auth
from app.safety.models import (
    ActiveIngredient,
    AdverseEventReport,
    MedicineIngredient,
    ReferenceSource,
    SafetyRule,
)

CHECKS = ("drug-drug", "drug-condition", "drug-food", "allergy")
OUTCOMES = {"findings", "no_matching_record", "insufficient_data"}


# ---------------------------------------------------------------------------- fixtures
@pytest.fixture
def ref(db):
    """Sources, ingredients, catalogue medicines with composition, and a few rules."""
    src = ReferenceSource(
        name="Test dataset", version="t1", jurisdiction="IN", reviewed_at=date(2026, 11, 1)
    )
    db.add(src)
    db.flush()

    def ingredient(name, drug_class=None, terms=()):
        row = ActiveIngredient(
            name=name,
            normalized_name=name.lower(),
            drug_class=drug_class,
            allergy_terms=list(terms),
            source_id=src.id,
        )
        db.add(row)
        db.flush()
        return row

    ibu, asp = (
        ingredient("Ibuprofen", "nsaid", ["nsaid"]),
        ingredient("Aspirin", "nsaid", ["nsaid"]),
    )
    para, amox = ingredient("Paracetamol"), ingredient("Amoxicillin", "penicillin", ["penicillin"])

    def medicine(
        name, ing, value, unit, strength, form="tablet", route="oral", release="immediate"
    ):
        m = Medicine(
            name=name,
            form=form,
            strength_text=strength,
            route=route,
            release_type=release,
            source="admin",
        )
        db.add(m)
        db.flush()
        db.add(
            MedicineIngredient(
                medicine_id=m.id, ingredient_id=ing.id, strength_value=value, strength_unit=unit
            )
        )
        db.flush()
        return m

    meds = {
        "ibuprofen": medicine("Ibuprofen", ibu, 400, "mg", "400 mg"),
        "brufen": medicine("Brufen", ibu, 400, "mg", "400 mg"),
        "aspirin": medicine("Aspirin", asp, 75, "mg", "75 mg", release=None),
        "paracetamol": medicine("Paracetamol", para, 500, "mg", "500 mg"),
        "amoxicillin": medicine("Amoxicillin", amox, 500, "mg", "500 mg", form="capsule"),
    }

    def rule(kind, a, b=None, term=None, severity="moderate"):
        if kind == "drug_drug":
            a, b = sorted([a.id, b.id])
        else:
            a = a.id
        row = SafetyRule(
            kind=kind,
            ingredient_id=a,
            counterpart_ingredient_id=b,
            counterpart_term=term,
            severity=severity,
            description=f"{kind} note",
            source_id=src.id,
            source_version="t1",
            reviewed_at=date(2026, 11, 1),
            jurisdiction="IN",
        )
        db.add(row)
        db.flush()
        return row

    rules = {
        "pair": rule("drug_drug", ibu, asp, severity="major"),
        "kidney": rule("drug_condition", ibu, term="kidney disease", severity="major"),
        "grapefruit": rule("drug_food", ibu, term="grapefruit", severity="minor"),
    }
    db.commit()
    return {
        "src": src,
        "ing": {"ibu": ibu, "asp": asp, "para": para, "amox": amox},
        "med": meds,
        "rule": rules,
    }


def add_med(actor, name, medicine=None, **over):
    body = {"display_name": name, "dose_text": "1 tablet", "units_per_dose": 1, **over}
    if medicine is not None:
        body["medicine_id"] = str(medicine.id)
    r = actor.post("/medications", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def check(actor, kind, **body):
    r = actor.post(f"/safety/{kind}/check", json=body)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["outcome"] in OUTCOMES
    return body


def promote(db, email):
    db.execute(User.__table__.update().where(User.email == email).values(role="admin"))
    db.commit()


@pytest.fixture
def admin(make_actor, db):
    actor = make_actor("curator@example.com")
    promote(db, "curator@example.com")
    return actor


# ---------------------------------------------------------------------------- drug-drug
def test_interaction_found_with_full_source_metadata(alice, ref):
    add_med(alice, "My ibuprofen", ref["med"]["ibuprofen"])
    add_med(alice, "My aspirin", ref["med"]["aspirin"])
    res = check(alice, "drug-drug")
    assert res["outcome"] == "findings"
    f = res["findings"][0]
    assert f["severity"] == "major"
    assert f["source"] == {
        "name": "Test dataset",
        "version": "t1",
        "reviewed_at": "2026-11-01",
        "jurisdiction": "IN",
    }
    assert set(f["medication_names"]) == {"My ibuprofen", "My aspirin"}
    assert res["disclaimer"]


def test_no_matching_rule_is_never_reported_as_safe(alice, ref):
    add_med(alice, "Ibuprofen", ref["med"]["ibuprofen"])
    add_med(alice, "Paracetamol", ref["med"]["paracetamol"])
    res = check(alice, "drug-drug")
    assert res["outcome"] == "no_matching_record"
    assert res["findings"] == []
    assert "does not mean" in " ".join(res["notes"])
    assert "safe" not in res["outcome"]


def test_unmapped_free_text_medicine_makes_result_insufficient(alice, ref):
    add_med(alice, "Ibuprofen", ref["med"]["ibuprofen"])
    add_med(alice, "Grandma's herbal tonic")
    res = check(alice, "drug-drug")
    assert res["outcome"] == "insufficient_data"
    assert res["unmapped_medications"] == ["Grandma's herbal tonic"]


def test_exact_name_match_maps_a_free_text_medicine(alice, ref):
    add_med(alice, "Ibuprofen")  # no catalogue link; same name as a catalogue row
    add_med(alice, "Aspirin")
    assert check(alice, "drug-drug")["outcome"] == "findings"


def test_inactive_medicines_are_not_checked_by_default(alice, ref):
    add_med(alice, "Ibuprofen", ref["med"]["ibuprofen"])
    stopped = add_med(alice, "Aspirin", ref["med"]["aspirin"])
    alice.patch(f"/medications/{stopped['id']}", json={"status": "stopped"})
    assert check(alice, "drug-drug")["outcome"] == "insufficient_data"  # only one active medicine


def test_retired_rule_no_longer_matches(alice, admin, ref, db):
    add_med(alice, "Ibuprofen", ref["med"]["ibuprofen"])
    add_med(alice, "Aspirin", ref["med"]["aspirin"])
    assert check(alice, "drug-drug")["outcome"] == "findings"
    r = admin.post(f"/admin/safety-rules/{ref['rule']['pair'].id}/retire")
    assert r.status_code == 200 and r.json()["status"] == "retired"
    assert check(alice, "drug-drug")["outcome"] == "no_matching_record"


def test_same_ingredient_in_two_medicines_is_flagged(alice, ref):
    add_med(alice, "Ibuprofen", ref["med"]["ibuprofen"])
    add_med(alice, "Brufen", ref["med"]["brufen"])
    res = check(alice, "drug-drug")
    assert res["duplicates"][0]["ingredient_name"] == "Ibuprofen"


# ----------------------------------------------------------------- condition, food, allergy
def test_condition_check_uses_active_conditions_only(alice, ref):
    add_med(alice, "Ibuprofen", ref["med"]["ibuprofen"])
    assert check(alice, "drug-condition")["outcome"] == "insufficient_data"  # none recorded
    alice.post("/conditions", json={"display_name": "Chronic kidney disease"})
    res = check(alice, "drug-condition")
    assert res["outcome"] == "findings"
    assert res["findings"][0]["matched_term"] == "Chronic kidney disease"
    alice.post("/conditions", json={"display_name": "Gout", "status": "resolved"})
    assert len(check(alice, "drug-condition")["findings"]) == 1


def test_food_check_lists_notes_or_filters(alice, ref):
    add_med(alice, "Ibuprofen", ref["med"]["ibuprofen"])
    assert [f["matched_term"] for f in check(alice, "drug-food")["findings"]] == ["grapefruit"]
    assert check(alice, "drug-food", foods=["grapefruit juice"])["outcome"] == "findings"
    assert check(alice, "drug-food", foods=["bread"])["outcome"] == "no_matching_record"
    assert check(alice, "drug-food", foods=[])["outcome"] == "insufficient_data"


def test_allergy_check_flags_possible_matches(alice, ref):
    add_med(alice, "Amoxicillin", ref["med"]["amoxicillin"])
    assert check(alice, "allergy")["outcome"] == "insufficient_data"  # nothing recorded = unknown
    alice.post("/allergies", json={"substance": "Penicillin", "severity": "severe"})
    res = check(alice, "allergy")
    assert res["outcome"] == "findings"
    hit = res["allergy_findings"][0]
    assert hit["basis"] == "curated_term" and hit["allergy_severity"] == "severe"
    assert hit["source"]["name"] == "Test dataset"


def test_allergy_with_no_match_is_not_declared_safe(alice, ref):
    add_med(alice, "Paracetamol", ref["med"]["paracetamol"])
    alice.post("/allergies", json={"substance": "Peanuts"})
    assert check(alice, "allergy")["outcome"] == "no_matching_record"


# ------------------------------------------------------------------------- authorization
@pytest.mark.parametrize("kind", CHECKS)
def test_checks_require_authentication(app, outbox, kind):
    from tests.conftest import Actor

    anon = Actor(app, outbox, "nobody@example.com")
    assert anon.post(f"/safety/{kind}/check", json={}, csrf=False).status_code == 401


def test_other_patients_medications_are_not_reachable(alice, bob, ref):
    mine = add_med(alice, "Ibuprofen", ref["med"]["ibuprofen"])
    add_med(alice, "Aspirin", ref["med"]["aspirin"])
    assert (
        bob.post("/safety/drug-drug/check", json={"medication_ids": [mine["id"]]}).status_code
        == 404
    )
    random = str(uuid.uuid4())
    assert bob.post("/safety/drug-drug/check", json={"medication_ids": [random]}).status_code == 404
    assert check(bob, "drug-drug")["checked_medications"] == 0  # default scope is his own


def test_patient_cannot_use_admin_curation(alice, ref):
    assert alice.get("/admin/safety-rules").status_code == 403
    assert alice.post("/admin/sources", json={}).status_code == 403
    assert (
        alice.put(f"/admin/medicines/{ref['med']['ibuprofen'].id}/composition", json={}).status_code
        == 403
    )


def test_audit_trail_has_counts_not_medicine_names(alice, ref, db):
    add_med(alice, "Ibuprofen", ref["med"]["ibuprofen"])
    add_med(alice, "Aspirin", ref["med"]["aspirin"])
    check(alice, "drug-drug")
    row = db.scalar(select(AuditLog).where(AuditLog.action == "safety.check"))
    assert row.event_metadata == {"kind": "drug_drug", "outcome": "findings", "medications": 2}
    assert "buprofen" not in json.dumps(row.event_metadata)


# ----------------------------------------------------------------------------- admin curation
def test_admin_curates_reference_data_end_to_end(admin, alice, db):
    src = admin.post(
        "/admin/sources",
        json={
            "name": "Hospital formulary",
            "jurisdiction": "IN",
            "version": "2026.1",
            "reviewed_at": "2026-10-01",
        },
    ).json()
    assert (
        admin.post(
            "/admin/sources",
            json={
                "name": "Hospital formulary",
                "jurisdiction": "IN",
                "version": "2026.1",
                "reviewed_at": "2026-10-01",
            },
        ).status_code
        == 409
    )
    ids = {}
    for name in ("Warfarin", "Fluconazole"):
        r = admin.post("/admin/ingredients", json={"name": name, "source_id": src["id"]})
        assert r.status_code == 201, r.text
        ids[name] = r.json()["id"]
    assert (
        admin.post(
            "/admin/ingredients", json={"name": "warfarin", "source_id": src["id"]}
        ).status_code
        == 409
    )

    body = {
        "kind": "drug_drug",
        "ingredient_id": ids["Warfarin"],
        "counterpart_ingredient_id": ids["Fluconazole"],
        "severity": "major",
        "description": "May increase bleeding risk.",
        "source_id": src["id"],
        "source_version": "2026.1",
        "reviewed_at": "2026-10-01",
        "jurisdiction": "IN",
    }
    first = admin.post("/admin/safety-rules", json=body)
    assert first.status_code == 201, first.text
    stored = first.json()
    assert str(stored["ingredient_id"]) < str(
        stored["counterpart_ingredient_id"]
    )  # canonical order
    reversed_body = {
        **body,
        "ingredient_id": ids["Fluconazole"],
        "counterpart_ingredient_id": ids["Warfarin"],
    }
    assert admin.post("/admin/safety-rules", json=reversed_body).status_code == 409  # same pair
    assert admin.get("/admin/safety-rules", params={"kind": "drug_drug"}).json()["total"] == 1
    actions = {a for (a,) in db.execute(select(AuditLog.action))}
    assert {"admin.source_create", "admin.ingredient_create", "admin.rule_create"} <= actions


@pytest.mark.parametrize(
    "patch",
    [
        {"counterpart_ingredient_id": None},  # drug-drug without a partner
        {"kind": "drug_food"},  # food rule with an ingredient partner
        {"severity": "safe"},  # not a severity
        {"reviewed_at": "2999-01-01"},  # future review date
        {"description": "ok"},  # too short to be a statement
    ],
)
def test_invalid_rules_are_rejected(admin, ref, patch):
    ibu, asp = ref["ing"]["ibu"], ref["ing"]["asp"]
    body = {
        "kind": "drug_drug",
        "ingredient_id": str(ibu.id),
        "counterpart_ingredient_id": str(asp.id),
        "severity": "minor",
        "description": "Valid description.",
        "source_id": str(ref["src"].id),
        "source_version": "t1",
        "reviewed_at": "2026-11-01",
        "jurisdiction": "IN",
        **patch,
    }
    assert admin.post("/admin/safety-rules", json=body).status_code == 422


def test_rule_with_unknown_ingredient_or_source_is_rejected(admin, ref):
    body = {
        "kind": "drug_food",
        "ingredient_id": str(uuid.uuid4()),
        "counterpart_term": "milk",
        "severity": "minor",
        "description": "Valid description.",
        "source_id": str(ref["src"].id),
        "source_version": "t1",
        "reviewed_at": "2026-11-01",
        "jurisdiction": "IN",
    }
    assert admin.post("/admin/safety-rules", json=body).status_code == 422


def test_medicine_warnings_come_from_rules_and_use_no_patient_data(alice, ref):
    r = alice.get(f"/safety/medicines/{ref['med']['ibuprofen'].id}/warnings")
    assert r.status_code == 200
    body = r.json()
    assert body["ingredients"] == ["Ibuprofen"]
    kinds = {x["kind"] for x in body["rules"]}
    assert kinds == {"drug_drug", "drug_condition", "drug_food"}
    pair = next(x for x in body["rules"] if x["kind"] == "drug_drug")
    assert pair["matched_term"] == "Aspirin"
    assert alice.get(f"/safety/medicines/{uuid.uuid4()}/warnings").status_code == 404


def test_medicine_without_rules_says_no_matching_record(alice, ref):
    body = alice.get(f"/safety/medicines/{ref['med']['paracetamol'].id}/warnings").json()
    assert body["rules"] == [] and "does not mean" in body["notes"][0]


# ---------------------------------------------------------------- alternatives and prices
def price(admin, medicine, **over):
    body = {
        "source_name": "City Pharmacy",
        "price": "30.00",
        "currency": "inr",
        "pack_quantity": "10",
        "pack_unit": "tablet",
        "jurisdiction": "IN",
        "observed_at": (datetime.now(UTC) - timedelta(days=3)).isoformat(),
        **over,
    }
    return admin.post(f"/admin/medicines/{medicine.id}/prices", json=body)


def test_candidates_match_composition_and_are_labelled(alice, admin, ref):
    r = alice.get(f"/medicines/{ref['med']['ibuprofen'].id}/alternatives")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "candidates"
    assert [c["medicine"]["name"] for c in body["candidates"]] == ["Brufen"]
    assert body["candidates"][0]["label"] == "candidate"
    assert "not substitutes" in body["notice"]


def test_missing_release_type_gives_insufficient_data_not_a_guess(alice, ref):
    body = alice.get(f"/medicines/{ref['med']['aspirin'].id}/alternatives").json()
    assert body["status"] == "insufficient_data" and body["missing"] == ["release type"]
    assert body["candidates"] == []


def test_different_form_is_not_a_candidate(alice, ref):
    assert (
        alice.get(f"/medicines/{ref['med']['amoxicillin'].id}/alternatives").json()["status"]
        == "no_candidates"
    )


def test_prices_are_sourced_dated_and_normalised(alice, admin, ref):
    assert price(admin, ref["med"]["ibuprofen"]).status_code == 201
    price(
        admin,
        ref["med"]["brufen"],
        price="45.00",
        pack_quantity="15",
        observed_at=(datetime.now(UTC) - timedelta(days=200)).isoformat(),
    )
    body = alice.get(f"/medicines/{ref['med']['ibuprofen'].id}/alternatives").json()
    own = body["subject"]["prices"][0]
    assert (own["source_name"], own["currency"], own["unit_price"]) == (
        "City Pharmacy",
        "INR",
        "3.0000",
    )
    assert own["stale"] is False and own["jurisdiction"] == "IN"
    other = body["candidates"][0]["medicine"]["prices"][0]
    assert other["stale"] is True and other["age_days"] >= 199
    assert "may have changed" in body["price_notice"]


def test_incomplete_prices_cannot_be_stored(admin, ref):
    full = {
        "source_name": "Shop",
        "price": "10",
        "currency": "INR",
        "pack_quantity": "10",
        "pack_unit": "tablet",
        "jurisdiction": "IN",
        "observed_at": "2026-11-01T10:00:00+05:30",
    }
    for missing in (
        "source_name",
        "price",
        "pack_quantity",
        "pack_unit",
        "jurisdiction",
        "observed_at",
    ):
        body = {k: v for k, v in full.items() if k != missing}
        assert (
            admin.post(
                f"/admin/medicines/{ref['med']['ibuprofen'].id}/prices", json=body
            ).status_code
            == 422
        )
    naive = {**full, "observed_at": "2026-11-01T10:00:00"}
    assert (
        admin.post(f"/admin/medicines/{ref['med']['ibuprofen'].id}/prices", json=naive).status_code
        == 422
    )


def test_admin_sets_composition_and_it_drives_matching(admin, alice, ref, db):
    plain = Medicine(name="NewBrand", form="tablet", strength_text="400 mg", source="admin")
    db.add(plain)
    db.commit()
    assert alice.get(f"/medicines/{plain.id}/alternatives").json()["status"] == "insufficient_data"
    r = admin.put(
        f"/admin/medicines/{plain.id}/composition",
        json={
            "route": "oral",
            "release_type": "immediate",
            "ingredients": [
                {
                    "ingredient_id": str(ref["ing"]["ibu"].id),
                    "strength_value": "400",
                    "strength_unit": "mg",
                }
            ],
        },
    )
    assert r.status_code == 204
    names = {
        c["medicine"]["name"]
        for c in alice.get(f"/medicines/{plain.id}/alternatives").json()["candidates"]
    }
    assert names == {"Ibuprofen", "Brufen"}
    bad = {"ingredients": [{"ingredient_id": str(ref["ing"]["ibu"].id), "strength_value": "400"}]}
    assert admin.put(f"/admin/medicines/{plain.id}/composition", json=bad).status_code == 422


# ------------------------------------------------------------------------------ authenticity
def test_authenticity_defaults_to_unable_to_verify(alice):
    r = alice.post("/safety/authenticity/check", json={"barcode": "8901234567890"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "unable_to_verify" and body["source"] is None
    assert "does not prove" in body["note"]


def test_authenticity_needs_some_input(alice):
    assert alice.post("/safety/authenticity/check", json={}).status_code == 422


def test_verified_without_a_named_source_is_downgraded(app, alice):
    class Overclaiming:
        def verify(self, **_):
            return auth.AuthenticityResult("verified", "Looks fine")

    app.state.authenticity = Overclaiming()
    body = alice.post("/safety/authenticity/check", json={"barcode": "1"}).json()
    assert body["status"] == "unable_to_verify"


def test_verified_with_a_named_source_passes_through(app, alice):
    class Real:
        def verify(self, **_):
            return auth.AuthenticityResult("verified", "Matched", source="Regulator registry")

    app.state.authenticity = Real()
    body = alice.post("/safety/authenticity/check", json={"barcode": "1"}).json()
    assert (body["status"], body["source"]) == ("verified", "Regulator registry")


def test_authenticity_supply_must_be_owned(alice, bob):
    med = add_med(alice, "Ibuprofen")
    supply = alice.post(
        f"/medications/{med['id']}/supplies", json={"quantity_initial": 10, "lot_number": "L1"}
    ).json()
    assert (
        alice.post("/safety/authenticity/check", json={"supply_id": supply["id"]}).status_code
        == 200
    )
    assert (
        bob.post("/safety/authenticity/check", json={"supply_id": supply["id"]}).status_code == 404
    )


# ----------------------------------------------------------------------------- adverse events
ADR = {"reaction": "Itchy rash on both arms", "severity": "mild"}


def test_adverse_event_records_the_report_without_claiming_causation(alice):
    med = add_med(alice, "Amoxicillin")
    r = alice.post(
        "/adverse-events", json={**ADR, "medication_id": med["id"], "onset_date": "2026-11-10"}
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["medication_name"] == "Amoxicillin" and body["status"] == "submitted"
    assert "does not show that a medicine caused it" in body["notice"]
    assert not {"causality", "caused_by", "assessment"} & set(body)
    assert alice.get("/adverse-events").json()["total"] == 1


def test_adverse_event_can_name_a_medicine_without_a_record(alice):
    r = alice.post("/adverse-events", json={**ADR, "medication_name": "Herbal tonic"})
    assert r.status_code == 201 and r.json()["medication_id"] is None


@pytest.mark.parametrize(
    "patch",
    [
        {"reaction": "x"},
        {"severity": "catastrophic"},
        {"outcome": "cured"},
        {"onset_date": "2999-01-01"},
        {"status": "submitted"},
        {"patient_user_id": str(uuid.uuid4())},
    ],
)
def test_adverse_event_validation(alice, patch):
    assert (
        alice.post("/adverse-events", json={**ADR, "medication_name": "X", **patch}).status_code
        == 422
    )
    assert alice.post("/adverse-events", json=ADR).status_code == 422  # no medicine named


def test_adverse_events_are_private(alice, bob):
    med = add_med(alice, "Amoxicillin")
    mine = alice.post("/adverse-events", json={**ADR, "medication_id": med["id"]}).json()
    assert bob.get("/adverse-events").json()["total"] == 0
    assert bob.delete(f"/adverse-events/{mine['id']}").status_code == 404
    assert bob.post("/adverse-events", json={**ADR, "medication_id": med["id"]}).status_code == 404
    record = alice.post("/records", json={"record_type": "other", "title": "Note"})
    assert record.status_code == 201, record.text
    body = {**ADR, "medication_name": "X", "record_id": record.json()["id"]}
    assert bob.post("/adverse-events", json=body).status_code == 404
    assert alice.post("/adverse-events", json=body).status_code == 201


def test_removal_is_soft_and_audited(alice, db):
    created = alice.post("/adverse-events", json={**ADR, "medication_name": "X"}).json()
    assert alice.delete(f"/adverse-events/{created['id']}").status_code == 204
    assert alice.get("/adverse-events").json()["total"] == 0
    row = db.get(AdverseEventReport, uuid.UUID(created["id"]))
    assert row is not None and row.status == "entered_in_error"
    assert db.scalar(select(AuditLog).where(AuditLog.action == "adverse_event.remove")) is not None
