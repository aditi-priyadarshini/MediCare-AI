"""Phase 7 diet planner: pure planner logic, then the preference/plan API."""

import pytest
from sqlalchemy import select

from app.audit.models import AuditLog
from app.identity.models import User
from app.medications.models import Medication
from app.nutrition import planner
from app.nutrition.catalogue import DIET_EXCLUDES, IDEAS, KNOWN_WORDS, tokens

DAIRY = {"milk", "curd", "paneer", "ghee", "buttermilk", "yogurt", "cheese", "butter"}
ANIMAL = {"fish", "chicken", "mutton", "prawn", "egg"}
ROOT = {"onion", "garlic", "potato", "carrot", "ginger", "beetroot", "radish"}


def prefs(diet="no_restriction", cuisine="general", meals=3, avoid=(), situations=()):
    return planner.Prefs(diet, cuisine, meals, tuple(avoid), tuple(situations))


def words(plan):
    return {
        w
        for day in plan.days
        for meal in day["meals"]
        for ing in meal["ingredients"]
        for w in tokens(ing)
    }


def names(plan):
    return [m["name"] for d in plan.days for m in d["meals"] if m["name"]]


# --------------------------------------------------------------------------- catalogue
def test_catalogue_is_consistent():
    ids = [i.id for i in IDEAS]
    assert len(ids) == len(set(ids))
    for idea in IDEAS:
        assert idea.slots and idea.cuisines and idea.ingredients and idea.description
    # tags come from ingredients, so a dairy word can never sit in an untagged idea
    for idea in IDEAS:
        if idea.words & {"paneer", "curd", "ghee", "milk"}:
            assert "dairy" in idea.tags, idea.id


@pytest.mark.parametrize("diet", list(DIET_EXCLUDES))
@pytest.mark.parametrize("slot", ["breakfast", "lunch", "snack", "dinner"])
def test_every_diet_has_options_for_every_slot(diet, slot):
    pool = planner.eligible(prefs(diet), [])
    assert len([i for i in pool if slot in i.slots]) >= 3


# ----------------------------------------------------------------------------- diets
def test_vegan_plan_has_no_animal_products():
    plan = planner.build_plan(prefs("vegan", meals=5), [])
    assert not words(plan) & (DAIRY | ANIMAL | {"honey"})


def test_vegetarian_allows_dairy_but_not_egg_or_flesh():
    plan = planner.build_plan(prefs("vegetarian", meals=5), [])
    assert not words(plan) & ANIMAL
    assert words(plan) & DAIRY


def test_eggetarian_and_pescatarian():
    assert "egg" in {w for i in planner.eligible(prefs("eggetarian"), []) for w in i.words}
    egg = planner.build_plan(prefs("eggetarian", meals=5), [])
    assert not words(egg) & {"fish", "chicken", "mutton", "prawn"}
    pesc = planner.build_plan(prefs("pescatarian", meals=5), [])
    assert not words(pesc) & {"chicken", "mutton"}


def test_jain_plan_has_no_roots_alliums_or_animal_products():
    plan = planner.build_plan(prefs("jain", meals=5), [])
    assert not words(plan) & (ROOT | ANIMAL | {"honey"})


# ------------------------------------------------------------------- avoid and allergy
@pytest.mark.parametrize(
    "term,banned",
    [
        ("milk", DAIRY),
        ("dairy", DAIRY),
        ("curd", {"curd"}),
        ("peanuts", {"peanut"}),
        ("nuts", {"almond", "walnut", "peanut", "nut"}),
        ("gluten", {"wheat", "semolina", "oat", "roti", "chapati", "bread"}),
        ("eggs", {"egg"}),
        ("brinjal", {"brinjal"}),
    ],
)
def test_avoided_foods_never_appear(term, banned):
    plan = planner.build_plan(prefs(avoid=[term], meals=5), [])
    assert plan.constraints_used["avoid_not_matched"] == []
    assert not words(plan) & banned


def test_recorded_allergies_are_always_applied():
    plan = planner.build_plan(prefs(meals=5), ["Peanut", "Shellfish"])
    assert plan.constraints_used["allergies_applied"] == ["peanut", "shellfish"]
    assert not words(plan) & {"peanut", "prawn"}


def test_allergy_we_cannot_match_is_flagged_not_silently_ignored():
    plan = planner.build_plan(prefs(), ["Penicillin"])
    assert plan.constraints_used["allergies_not_matched"] == ["penicillin"]
    flag = next(f for f in plan.flags if f.code == "allergy_not_checked")
    assert "penicillin" in flag.message and flag.severity == "review"


def test_unknown_avoid_term_is_flagged():
    plan = planner.build_plan(prefs(avoid=["dragonfruit"]), [])
    assert plan.constraints_used["avoid_not_matched"] == ["dragonfruit"]
    assert any(f.code == "avoid_not_checked" for f in plan.flags)


def test_constraints_are_never_relaxed_to_fill_a_slot():
    # vegan + no soy/legumes/rice leaves too little: slots stay empty rather than breaking a rule
    avoid = ["rice", "wheat", "lentil", "dal", "gram", "coconut", "tofu", "bean", "pea"]
    plan = planner.build_plan(prefs("vegan", avoid=avoid, meals=5), [])
    empties = [m for d in plan.days for m in d["meals"] if m["idea_id"] is None]
    assert empties and all(m["name"] is None and m["ingredients"] == [] for m in empties)
    assert any(f.code == "limited_options" for f in plan.flags)
    assert not words(plan) & {"rice", "wheat", "tofu", "bean", "pea"}


# --------------------------------------------------------------------------- structure
@pytest.mark.parametrize("meals,slots", [(2, 2), (3, 3), (4, 4), (5, 5)])
def test_shape_of_a_plan(meals, slots):
    plan = planner.build_plan(prefs(meals=meals), [])
    assert [d["day"] for d in plan.days] == list(range(1, 8))
    assert all(len(d["meals"]) == slots for d in plan.days)


def test_plan_is_deterministic_and_varied():
    a = planner.build_plan(prefs("vegetarian"), [])
    b = planner.build_plan(prefs("vegetarian"), [])
    assert a == b
    assert len(set(names(a))) >= 10
    for day in a.days:  # no idea twice in one day when there was a choice
        picked = [m["idea_id"] for m in day["meals"]]
        assert len(picked) == len(set(picked))


def test_regional_preference_prefers_that_region_plus_general():
    plan = planner.build_plan(prefs("vegetarian", cuisine="east_indian"), [])
    assert any(
        "Dalma" in n or "Santula" in n or "Pakhala" in n or "Chuda" in n for n in names(plan)
    )
    assert not any("Rajma" in n for n in names(plan))


def test_no_numbers_or_health_claims_in_a_plan():
    plan = planner.build_plan(prefs(meals=5), [])
    text = " ".join(n.lower() for n in names(plan))
    for banned in ("kcal", "calorie", "protein", "cure", "lower your", "diabetic"):
        assert banned not in text
    for idea in IDEAS:
        assert not any(c.isdigit() for c in idea.description), idea.id


def test_known_words_cover_the_collection():
    assert {"milk", "peanut", "gluten", "nut"} <= KNOWN_WORDS
    assert all(w in KNOWN_WORDS for i in IDEAS for w in i.words)


# ----------------------------------------------------------------------------- screening
def codes(flags):
    return {f.code: f.severity for f in flags}


@pytest.mark.parametrize(
    "conditions,code",
    [
        (["Chronic kidney disease"], "kidney_disease"),
        (["CKD stage 3"], "kidney_disease"),
        (["Renal failure"], "kidney_disease"),
        (["Anorexia nervosa"], "eating_disorder"),
        (["Binge-eating disorder"], "eating_disorder"),
    ],
)
def test_conditions_that_block_a_plan(conditions, code):
    flags = planner.screen(prefs(), conditions, 0)
    assert codes(flags)[code] == "block" and planner.blocking(flags)


@pytest.mark.parametrize(
    "situation", ["kidney_disease", "eating_disorder_history", "child_under_12"]
)
def test_stated_situations_that_block_a_plan(situation):
    assert planner.blocking(planner.screen(prefs(situations=[situation]), [], 0))


def test_review_and_info_flags_do_not_block():
    flags = planner.screen(prefs(situations=["pregnant_or_breastfeeding", "clinician_diet"]), [], 0)
    assert codes(flags) == {"pregnancy": "review", "clinician_diet": "review"}
    assert planner.blocking(flags) is None
    assert codes(planner.screen(prefs(), ["Type 2 diabetes"], 0)) == {"condition_recorded": "info"}
    assert codes(planner.screen(prefs(), ["Asthma", "Hypertension"], 0)) == {
        "multiple_conditions": "review"
    }
    assert codes(planner.screen(prefs(), [], 2)) == {"medicines_recorded": "review"}
    assert planner.screen(prefs(), [], 0) == []
    assert codes(planner.screen(prefs(), ["Currently pregnant"], 0)) == {
        "pregnancy": "review",
        "condition_recorded": "info",
    }


# ------------------------------------------------------------------------------- API
PREFS = {"diet_type": "vegetarian", "cuisine": "east_indian", "meals_per_day": 3}


def test_preferences_default_then_roundtrip(alice):
    p = alice.get("/diet/preferences").json()
    assert p["saved"] is False and p["diet_type"] == "no_restriction" and p["meals_per_day"] == 3
    assert "not a prescription" in p["notice"]
    saved = alice.put(
        "/diet/preferences",
        json={
            **PREFS,
            "avoid_foods": [" Brinjal ", "brinjal", "Peanuts"],
            "situations": ["clinician_diet"],
        },
    )
    assert saved.status_code == 200
    body = alice.get("/diet/preferences").json()
    assert body["saved"] is True and body["avoid_foods"] == ["brinjal", "peanuts"]
    assert body["situations"] == ["clinician_diet"]
    assert [f["code"] for f in body["review_flags"]] == ["clinician_diet"]
    assert (
        alice.put("/diet/preferences", json={**PREFS, "meals_per_day": 4}).json()["meals_per_day"]
        == 4
    )


@pytest.mark.parametrize(
    "patch",
    [
        {"diet_type": "carnivore"},
        {"cuisine": "martian"},
        {"meals_per_day": 1},
        {"meals_per_day": 6},
        {"avoid_foods": [str(i) for i in range(21)]},
        {"avoid_foods": ["x" * 41]},
        {"situations": ["unknown"]},
        {"extra": 1},
    ],
)
def test_preference_validation(alice, patch):
    assert alice.put("/diet/preferences", json={**PREFS, **patch}).status_code == 422


def test_preferences_are_per_patient(alice, bob):
    alice.put("/diet/preferences", json={**PREFS, "diet_type": "vegan"})
    assert bob.get("/diet/preferences").json()["saved"] is False


def test_plans_need_saved_preferences(alice):
    r = alice.post("/diet/plans", json={})
    assert r.status_code == 409 and r.json()["error"]["code"] == "PREFERENCES_REQUIRED"


def test_create_read_list_delete_plan(alice, bob):
    alice.put("/diet/preferences", json={**PREFS, "avoid_foods": ["brinjal"]})
    r = alice.post("/diet/plans", json={"title": "  Week one "})
    assert r.status_code == 201
    plan = r.json()
    assert plan["title"] == "Week one" and len(plan["days"]) == 7
    assert plan["constraints_used"]["avoid_foods"] == ["brinjal"]
    assert plan["constraints_used"]["diet_type"] == "vegetarian"
    assert "not a prescription" in plan["notice"] and len(plan["limitations"]) == 3
    assert plan["review_flags"][0]["code"] == "general_education"
    assert plan["catalogue_version"]
    assert alice.get(f"/diet/plans/{plan['id']}").json()["days"] == plan["days"]
    assert [p["id"] for p in alice.get("/diet/plans").json()["items"]] == [plan["id"]]

    assert bob.get(f"/diet/plans/{plan['id']}").status_code == 404
    assert bob.delete(f"/diet/plans/{plan['id']}").status_code == 404
    assert bob.get("/diet/plans").json()["total"] == 0

    assert alice.delete(f"/diet/plans/{plan['id']}").status_code == 204
    assert alice.get(f"/diet/plans/{plan['id']}").status_code == 404


def test_default_title(alice):
    alice.put("/diet/preferences", json=PREFS)
    assert alice.post("/diet/plans", json={}).json()["title"] == "7-day meal ideas"


def test_recorded_allergies_shape_the_plan_without_being_asked(alice):
    assert alice.post("/allergies", json={"substance": "Peanuts"}).status_code == 201
    assert alice.post("/allergies", json={"substance": "Penicillin"}).status_code == 201
    alice.put("/diet/preferences", json={**PREFS, "meals_per_day": 5})
    plan = alice.post("/diet/plans", json={}).json()
    assert plan["constraints_used"]["allergies_applied"] == ["peanuts"]
    assert plan["constraints_used"]["allergies_not_matched"] == ["penicillin"]
    ingredients = {i for d in plan["days"] for m in d["meals"] for i in m["ingredients"]}
    assert "peanuts" not in ingredients
    assert "allergy_not_checked" in {f["code"] for f in plan["review_flags"]}


def test_kidney_condition_in_the_profile_blocks_even_if_not_mentioned_here(alice, db):
    alice.post("/conditions", json={"display_name": "Chronic kidney disease"})
    alice.put("/diet/preferences", json=PREFS)
    shown = alice.get("/diet/preferences").json()["review_flags"]
    assert shown[0]["code"] == "kidney_disease" and shown[0]["severity"] == "block"
    r = alice.post("/diet/plans", json={})
    assert r.status_code == 409 and r.json()["error"]["code"] == "DIETITIAN_REVIEW_REQUIRED"
    assert "renal dietitian" in r.json()["error"]["message"]
    assert alice.get("/diet/plans").json()["total"] == 0
    row = db.scalar(select(AuditLog).where(AuditLog.action == "diet.plan_declined"))
    assert row is not None and row.event_metadata == {"flag": "kidney_disease"}


def test_resolved_conditions_do_not_block(alice):
    cond = alice.post("/conditions", json={"display_name": "Kidney stones"}).json()
    alice.patch(f"/conditions/{cond['id']}", json={"status": "resolved"})
    alice.put("/diet/preferences", json=PREFS)
    assert alice.post("/diet/plans", json={}).status_code == 201


@pytest.mark.parametrize(
    "situation", ["eating_disorder_history", "child_under_12", "kidney_disease"]
)
def test_stated_situations_block_plan_creation(alice, situation):
    alice.put("/diet/preferences", json={**PREFS, "situations": [situation]})
    assert alice.post("/diet/plans", json={}).status_code == 409


def test_pregnancy_and_medicines_flag_but_still_produce_a_plan(alice, db):
    alice.put("/diet/preferences", json={**PREFS, "situations": ["pregnant_or_breastfeeding"]})
    user = db.scalar(select(User).where(User.email == "alice@example.com"))
    db.add(Medication(patient_user_id=user.id, display_name="Metformin", status="active"))
    db.commit()
    plan = alice.post("/diet/plans", json={})
    assert plan.status_code == 201
    flags = {f["code"]: f["severity"] for f in plan.json()["review_flags"]}
    assert flags["pregnancy"] == "review" and flags["medicines_recorded"] == "review"


def test_plan_audit_holds_flag_codes_not_content(alice, db):
    alice.put("/diet/preferences", json={**PREFS, "avoid_foods": ["secretfood"]})
    alice.post("/diet/plans", json={})
    rows = list(db.scalars(select(AuditLog).where(AuditLog.action.like("diet.%"))))
    assert {r.action for r in rows} == {"diet.preferences_update", "diet.plan_create"}
    assert all("secretfood" not in str(r.event_metadata) for r in rows)


def test_plan_count_is_capped(alice, monkeypatch):
    from app.nutrition import router

    monkeypatch.setattr(router, "MAX_PLANS", 2)
    alice.put("/diet/preferences", json=PREFS)
    assert alice.post("/diet/plans", json={}).status_code == 201
    assert alice.post("/diet/plans", json={}).status_code == 201
    r = alice.post("/diet/plans", json={})
    assert r.status_code == 409 and r.json()["error"]["code"] == "PLAN_LIMIT"


def test_diet_requires_login(app, outbox):
    from tests.conftest import Actor

    anon = Actor(app, outbox, "anon@example.com")
    assert anon.get("/diet/preferences").status_code == 401
    assert anon.post("/diet/plans", json={}).status_code == 401
