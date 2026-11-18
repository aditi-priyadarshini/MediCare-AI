# ruff: noqa: F811  (fixtures imported from test_safety are used as arguments)
"""AI generic alternatives and price estimates.

A scripted provider stands in for the model. What matters: nothing is sent without consent, the
model sees only medicine names, a suggested product is shown only if its ingredients, strength
and form really match, a price that cannot be believed is dropped, an AI price is always an
estimate and never looks like a sourced one, and catalogue results are never replaced.
"""

import json
import re

import pytest
from sqlalchemy import select

from app.assistant.models import ChatContextAccessLog
from app.assistant.provider import LLMResult, LLMUnavailable
from app.audit.models import AuditLog
from app.main import create_app
from app.safety import ai_alternatives as alt
from tests.test_safety import add_med, ref  # noqa: F401  (fixtures)

PRICE = {"low": 20, "high": 40, "pack": 10, "unit": "tablet"}


class ScriptedLLM:
    name = "scripted"
    model = "test-model"

    def __init__(self):
        self.configured = True
        self.reply: str | Exception | None = None
        self.calls: list[dict] = []

    def complete(self, *, system: str, user: str, max_tokens: int) -> LLMResult:
        self.calls.append({"system": system, "user": user, "max_tokens": max_tokens})
        if isinstance(self.reply, Exception):
            raise self.reply
        text = self.reply if self.reply is not None else self._default(user)
        return LLMResult(text, self.model, self.name, (self.name,))

    @staticmethod
    def _default(user: str) -> str:
        nums = [int(n) for n in re.findall(r"^(\d+)\.", user, re.M)]
        return json.dumps({"medicines": [{"med": n, "recognised": False} for n in nums]})


@pytest.fixture
def llm() -> ScriptedLLM:
    return ScriptedLLM()


@pytest.fixture
def app(settings, outbox, google, llm):
    application = create_app(settings, email=outbox, google=google, llm=llm)
    yield application
    application.state.engine.dispose()


def grant(actor, on: bool = True):
    assert actor.put("/consents/ai_context", json={"granted": on}).status_code == 200


def find(actor, **body):
    r = actor.post("/safety/ai-alternatives", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def entry(
    med=1, *, ingredients=("metformin",), strength="500 mg", form="tablet", price=PRICE, **kw
):
    row = {
        "med": med,
        "recognised": True,
        "generic_name": "metformin",
        "brand": True,
        "ingredients": list(ingredients),
        "strength": strength,
        "form": form,
        "alternatives": [],
    }
    if price is not None:
        row["price"] = price
    return {**row, **kw}


def product(
    name, *, kind="brand", ingredients=("metformin",), strength="500 mg", form="tablet", price=PRICE
):
    row = {
        "name": name,
        "kind": kind,
        "ingredients": list(ingredients),
        "strength": strength,
        "form": form,
    }
    if price is not None:
        row["price"] = price
    return row


def reply(*rows) -> str:
    return json.dumps({"medicines": list(rows)})


def glycomet(actor, **over):
    return add_med(actor, "Glycomet", strength_text="500 mg", form="tablet", **over)


# ------------------------------------------------------------------------ access and consent
def test_needs_login(app):
    from fastapi.testclient import TestClient

    anon = TestClient(app, headers={"Origin": "http://localhost:3000"})
    assert anon.post("/api/v1/safety/ai-alternatives", json={}).status_code == 401


def test_nothing_to_look_up(alice, llm):
    grant(alice)
    assert find(alice)["mode"] == "none" and llm.calls == []


def test_nothing_is_sent_without_consent_but_the_catalogue_still_shows(alice, llm, ref):
    add_med(alice, "My brufen", ref["med"]["brufen"])
    body = find(alice)
    assert body["mode"] == "consent_required" and llm.calls == []
    only = body["medicines"][0]
    assert only["status"] == "not_checked" and only["alternatives"] == []
    assert only["reference"]["status"] == "candidates"
    assert [c["medicine"]["name"] for c in only["reference"]["candidates"]] == ["Ibuprofen"]


def test_unconfigured_model(alice, llm):
    grant(alice)
    glycomet(alice)
    llm.configured = False
    assert find(alice)["mode"] == "ai_unavailable" and llm.calls == []


def test_one_medicine_by_name_or_the_list_but_not_both(alice):
    med = glycomet(alice)
    both = {"medication_ids": [med["id"]], "medicine_name": "Glycomet"}
    assert alice.post("/safety/ai-alternatives", json=both).status_code == 422
    assert alice.post("/safety/ai-alternatives", json={"strength": "500 mg"}).status_code == 422
    assert alice.post("/safety/ai-alternatives", json={"extra": 1}).status_code == 422


# ----------------------------------------------------------------------- what the model is sent
def test_only_the_medicine_name_strength_and_form_are_sent(alice, llm, db):
    alice.put("/profile", json={"display_name": "Alice Das", "date_of_birth": "1950-05-17"})
    alice.post("/conditions", json={"display_name": "Asthma"})
    alice.post("/allergies", json={"substance": "Penicillin"})
    grant(alice)
    glycomet(alice)
    find(alice)
    sent = "\n".join(c["user"] for c in llm.calls)
    assert "Glycomet (strength: 500 mg; form: tablet)" in sent
    for secret in ("Asthma", "Penicillin", "Alice", "alice@example.com", "1950"):
        assert secret not in sent
    log = db.scalar(
        select(ChatContextAccessLog).where(ChatContextAccessLog.purpose == "safety_ai_alternatives")
    )
    assert log is not None and log.provider == "scripted"


def test_lookup_by_name_needs_no_medicines_on_the_list(alice, llm):
    grant(alice)
    llm.reply = reply(entry(price=None))
    body = find(alice, medicine_name="Glycomet", strength="500 mg")
    assert body["mode"] == "ai" and body["medicines"][0]["medication_id"] is None
    assert "Glycomet (strength: 500 mg)" in llm.calls[0]["user"]


# ------------------------------------------------------------------- what is kept of the answer
def test_candidates_must_match_ingredients_strength_and_form(alice, llm):
    grant(alice)
    glycomet(alice)
    llm.reply = reply(
        entry(
            alternatives=[
                product("Metformin", kind="generic"),
                product("Glucophage"),
                product("Glycomet"),  # the medicine itself
                product("Glucophage"),  # repeated
                product("Wrong Ingredient", ingredients=("glipizide",)),
                product("Extra Ingredient", ingredients=("metformin", "glipizide")),
                product("Wrong Strength", strength="1000 mg"),
                product("Wrong Form", form="syrup"),
                product("Bad <b>Name</b>"),
                product(""),
                product("Salt Form", ingredients=("metformin hydrochloride",)),
            ]
        )
    )
    body = find(alice)
    names = [a["name"] for a in body["medicines"][0]["alternatives"]]
    assert names == ["Metformin", "Glucophage", "Salt Form"]  # generics first, ties by name
    assert body["medicines"][0]["status"] == "found"
    assert body["medicines"][0]["generic_name"] == "metformin"


def test_a_candidate_with_no_stated_strength_is_kept_but_marked(alice, llm):
    grant(alice)
    glycomet(alice)
    llm.reply = reply(entry(alternatives=[product("Glucophage", strength="", form="")]))
    only = find(alice)["medicines"][0]["alternatives"][0]
    assert only["differences"] == ["Strength not confirmed", "Form not confirmed"]


def test_recorded_strength_beats_the_models_reading_of_it(alice, llm):
    grant(alice)
    glycomet(alice)  # recorded 500 mg
    llm.reply = reply(
        entry(strength="850 mg", alternatives=[product("Glucophage", strength="850 mg")])
    )
    body = find(alice)["medicines"][0]
    assert body["strength"] == "500 mg" and body["alternatives"] == []
    assert body["status"] == "none_found"


def test_at_most_four_alternatives(alice, llm):
    grant(alice)
    glycomet(alice)
    llm.reply = reply(entry(alternatives=[product(f"Brand {c}") for c in "ABCDEFG"]))
    assert len(find(alice)["medicines"][0]["alternatives"]) == alt.MAX_ALTERNATIVES


def test_unrecognised_medicine_gets_nothing(alice, llm):
    grant(alice)
    glycomet(alice)
    # Everything else in the entry is perfectly valid: only the "not recognised" flag stops it.
    llm.reply = reply({**entry(alternatives=[product("Invented")]), "recognised": False})
    body = find(alice)["medicines"][0]
    assert body["status"] == "not_recognised" and body["alternatives"] == []
    assert body["own_price"] is None


def test_a_medicine_without_ingredients_cannot_be_matched(alice, llm):
    grant(alice)
    glycomet(alice)
    llm.reply = reply(entry(ingredients=[], alternatives=[product("Glucophage")]))
    assert find(alice)["medicines"][0]["status"] == "not_recognised"


# ---------------------------------------------------------------------------------- prices
def test_ai_prices_are_estimates_with_a_pack_and_a_unit_price(alice, llm):
    grant(alice)
    glycomet(alice)
    llm.reply = reply(
        entry(
            price={"low": 30, "high": 60, "pack": 10, "unit": "tablet"},
            alternatives=[
                product(
                    "Metformin",
                    kind="generic",
                    price={"low": 12.5, "high": 25, "pack": 10, "unit": "tablet"},
                )
            ],
        )
    )
    body = find(alice)
    own = body["medicines"][0]["own_price"]
    assert own["basis"] == "ai_estimate" and own["currency"] == "INR"
    assert (own["unit_low"], own["unit_high"]) == ("3.00", "6.00")
    cheap = body["medicines"][0]["alternatives"][0]["price"]
    assert (cheap["unit_low"], cheap["unit_high"]) == ("1.25", "2.50")
    assert "estimate" in body["price_notice"].lower() and "not quotes" in body["price_notice"]
    # An estimate carries no source or date, so it can never pass for a recorded price.
    assert "source_name" not in own and "observed_at" not in own


@pytest.mark.parametrize(
    "bad",
    [
        {"low": 0, "high": 10, "pack": 10, "unit": "tablet"},
        {"low": -5, "high": 10, "pack": 10, "unit": "tablet"},
        {"low": 40, "high": 20, "pack": 10, "unit": "tablet"},  # high below low
        {"low": 1, "high": 500, "pack": 10, "unit": "tablet"},  # absurdly wide
        {"low": 10, "high": 10_000_000, "pack": 10, "unit": "tablet"},
        {"low": 20, "high": 40, "pack": 0, "unit": "tablet"},
        {"low": 20, "high": 40, "pack": 2.5, "unit": "tablet"},
        {"low": 20, "high": 40, "pack": 100000, "unit": "tablet"},
        {"low": 20, "high": 40, "pack": 10, "unit": "bottle of wine"},
        {"low": "20", "high": "40", "pack": 10, "unit": "tablet"},
        {"low": True, "high": True, "pack": 1, "unit": "tablet"},
        {"low": 20, "high": 40, "pack": 10},
        {"low": float("nan"), "high": 40, "pack": 10, "unit": "tablet"},
        "free",
        None,
        [],
    ],
)
def test_prices_that_cannot_be_believed_are_dropped(bad):
    assert alt._price(bad) is None


def test_a_good_price_is_kept():
    guess = alt._price({"low": 20, "high": 40, "pack": 10, "unit": "tablet"})
    assert guess is not None and guess.pack == 10


def test_a_dropped_price_does_not_drop_the_product(alice, llm):
    grant(alice)
    glycomet(alice)
    llm.reply = reply(
        entry(
            price={"low": 0, "high": 0, "pack": 1, "unit": "tablet"},
            alternatives=[product("Glucophage", price="cheap")],
        )
    )
    body = find(alice)["medicines"][0]
    assert body["own_price"] is None
    assert (
        body["alternatives"][0]["name"] == "Glucophage" and body["alternatives"][0]["price"] is None
    )


def test_ordering_is_generics_first_then_lowest_estimate_and_unpriced_last(alice, llm):
    grant(alice)
    glycomet(alice)
    cheap = {"low": 10, "high": 20, "pack": 10, "unit": "tablet"}
    dear = {"low": 100, "high": 200, "pack": 10, "unit": "tablet"}
    llm.reply = reply(
        entry(
            alternatives=[
                product("Unpriced Brand", price=None),
                product("Dear Brand", price=dear),
                product("Cheap Brand", price=cheap),
                product("Dear Generic", kind="generic", price=dear),
            ]
        )
    )
    names = [a["name"] for a in find(alice)["medicines"][0]["alternatives"]]
    assert names == ["Dear Generic", "Cheap Brand", "Dear Brand", "Unpriced Brand"]


# --------------------------------------------------------------------- catalogue stays intact
def test_catalogue_candidates_are_returned_next_to_the_ai_ones(alice, llm, ref):
    grant(alice)
    add_med(alice, "My brufen", ref["med"]["brufen"], strength_text="400 mg", form="tablet")
    llm.reply = reply(
        entry(
            ingredients=("ibuprofen",),
            strength="400 mg",
            alternatives=[product("Ibugesic", ingredients=("ibuprofen",), strength="400 mg")],
        )
    )
    body = find(alice)["medicines"][0]
    assert [a["name"] for a in body["alternatives"]] == ["Ibugesic"]
    assert [c["medicine"]["name"] for c in body["reference"]["candidates"]] == ["Ibuprofen"]


# --------------------------------------------------------------------------------- failures
def test_unreadable_reply_is_not_a_result(alice, llm):
    grant(alice)
    glycomet(alice)
    llm.reply = "Sorry, I can't do that."
    body = find(alice)
    assert body["mode"] == "ai_unavailable" and body["medicines"][0]["status"] == "not_checked"


def test_one_failed_call_gives_a_partial_result(alice, llm):
    grant(alice)
    for name in ("Med A", "Med B", "Med C", "Med D"):  # 3 + 1: two calls
        add_med(alice, name, strength_text="500 mg", form="tablet")
    original = llm.complete

    def flaky(*, system, user, max_tokens):
        if "Med D" in user:
            raise LLMUnavailable("down", ("scripted",))
        return original(system=system, user=user, max_tokens=max_tokens)

    llm.complete = flaky
    llm.reply = reply(entry(1), entry(2), entry(3))
    body = find(alice)
    assert body["mode"] == "partial" and "3 of 4" in body["message"]
    statuses = {m["name"]: m["status"] for m in body["medicines"]}
    assert statuses["Med D"] == "not_checked" and statuses["Med A"] == "none_found"


def test_only_the_first_eight_medicines_are_checked(alice, llm):
    grant(alice)
    for i in range(alt.MAX_MEDICINES + 1):
        add_med(alice, f"Med {chr(65 + i)}", strength_text="500 mg", form="tablet")
    body = find(alice)
    assert len(body["medicines"]) == alt.MAX_MEDICINES
    assert "first 8" in body["message"] and len(llm.calls) == 3


# ------------------------------------------------------------------------------- audit & access
def test_audit_holds_counts_never_names(alice, llm, db):
    grant(alice)
    glycomet(alice)
    llm.reply = reply(entry(alternatives=[product("Glucophage")]))
    find(alice)
    meta = db.scalar(
        select(AuditLog).where(AuditLog.action == "safety.ai_alternatives")
    ).event_metadata
    assert meta["mode"] == "ai" and meta["medicines"] == 1
    assert "Glycomet" not in json.dumps(meta) and "Glucophage" not in json.dumps(meta)


def test_another_patients_medication_id_is_not_found(alice, bob, llm):
    grant(alice)
    other = add_med(bob, "Warfarin")
    r = alice.post("/safety/ai-alternatives", json={"medication_ids": [other["id"]]})
    assert r.status_code == 404 and llm.calls == []


# ------------------------------------------------------------------------------ pure helpers
def test_salt_names_do_not_make_two_ingredients_different():
    assert alt.normalise_ingredient("Metformin Hydrochloride") == "metformin"
    assert alt.normalise_ingredient("Amlodipine Besylate") == "amlodipine"
    assert alt.normalise_ingredient("Diclofenac Sodium") == "diclofenac"


def test_strengths_compare_without_case_or_spaces_and_without_unit_conversion():
    assert alt.compact("500 MG") == alt.compact("500mg")
    assert alt.compact("0.5 g") != alt.compact("500 mg")


def test_parser_rejects_malformed_entries():
    good = entry(alternatives=[product("Glucophage")])
    for junk in ("", "no json", "[1]", '{"medicines": 3}', "{"):
        assert alt.parse_reply(junk, {1}) == {}
    out = alt.parse_reply(reply(good, entry(1), entry(9), {"med": True}, "x"), {1})
    assert set(out) == {1} and len(out[1].alternatives) == 1
