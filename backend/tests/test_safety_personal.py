# ruff: noqa: F811  (fixtures imported from test_safety are used as arguments)
"""Personalised safety: overview status, one-medicine lookup, adverse effects, AI explanation.

Reuses the small reference dataset from test_safety (`ref`). Rules there: ibuprofen+aspirin
(major), ibuprofen with kidney disease (major), ibuprofen with grapefruit (minor).
"""

import json
from datetime import date

import pytest
from sqlalchemy import select

from app.assistant.models import ChatContextAccessLog
from app.assistant.provider import LLMResult, LLMUnavailable
from app.audit.models import AuditLog
from app.main import create_app
from app.safety import assessment as asm
from app.safety import engine as eng
from app.safety.models import IngredientEffect
from tests.test_safety import add_med, admin, promote, ref  # noqa: F401  (fixtures)

STATUSES = {"needs_attention", "review", "no_matching_record", "insufficient_data"}


# --------------------------------------------------------------------------- fake model
class ScriptedLLM:
    name = "scripted"
    model = "test-model"

    def __init__(self):
        self.configured = True
        self.reply: str | Exception = "The two medicines are flagged together as a major note [E1]."
        self.calls: list[dict] = []

    def complete(self, *, system: str, user: str, max_tokens: int) -> LLMResult:
        self.calls.append({"system": system, "user": user})
        if isinstance(self.reply, Exception):
            raise self.reply
        return LLMResult(self.reply, self.model, self.name, (self.name,))


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


def overview(actor, **body):
    r = actor.post("/safety/overview", json=body)
    assert r.status_code == 200, r.text
    assert r.json()["status"] in STATUSES
    return r.json()


def lookup(actor, medicine, **body):
    r = actor.post(f"/safety/medicines/{medicine.id}/personal-check", json=body)
    assert r.status_code == 200, r.text
    assert r.json()["status"] in STATUSES
    return r.json()


def add_effect(db, ref, ingredient, effect, frequency="common", seriousness="mild", help_text=None):
    row = IngredientEffect(
        ingredient_id=ref["ing"][ingredient].id,
        effect=effect,
        frequency=frequency,
        seriousness=seriousness,
        when_to_get_help=help_text,
        source_id=ref["src"].id,
        source_version="t1",
        reviewed_at=date(2026, 11, 1),
        jurisdiction="IN",
    )
    db.add(row)
    db.commit()
    return row


# ------------------------------------------------------------------------------ overview
def test_serious_interaction_needs_attention(alice, ref):
    add_med(alice, "My ibuprofen", ref["med"]["ibuprofen"])
    add_med(alice, "My aspirin", ref["med"]["aspirin"])
    res = overview(alice)
    assert res["status"] == "needs_attention"
    assert res["counts"]["needs_attention"] == 1
    top = res["issues"][0]
    assert top["section"] == "drug_drug" and top["severity"] == "major"
    assert top["source"]["name"] == "Test dataset"
    assert res["context"]["medications"] == 2


def test_duplicate_only_is_review_not_needs_attention(alice, ref):
    add_med(alice, "Ibuprofen", ref["med"]["ibuprofen"])
    add_med(alice, "Brufen", ref["med"]["brufen"])
    res = overview(alice)
    assert res["status"] == "review"
    assert res["issues"][0]["section"] == "duplicate"


def test_nothing_found_is_never_called_safe_and_says_what_is_unknown(alice, ref):
    add_med(alice, "Ibuprofen", ref["med"]["ibuprofen"])
    add_med(alice, "Paracetamol", ref["med"]["paracetamol"])
    res = overview(alice)
    assert res["status"] == "no_matching_record"
    text = " ".join(res["notes"])
    assert "conditions" in text and "allergies" in text and "unknown" in text
    assert "safe" not in json.dumps(res["status"])


def test_general_food_notes_do_not_change_the_status_until_foods_are_entered(alice, ref):
    add_med(alice, "Ibuprofen", ref["med"]["ibuprofen"])
    add_med(alice, "Paracetamol", ref["med"]["paracetamol"])
    plain = overview(alice)
    assert plain["checks"]["drug_food"]["findings"]  # listed for information
    assert plain["status"] == "no_matching_record" and plain["issues"] == []
    typed = overview(alice, foods=["grapefruit juice"])
    assert typed["status"] == "review"
    assert typed["issues"][0]["section"] == "drug_food"
    assert typed["context"]["foods"] == 1


def test_recorded_allergy_match_needs_attention(alice, ref):
    add_med(alice, "Amoxicillin", ref["med"]["amoxicillin"])
    alice.post("/allergies", json={"substance": "Penicillin", "severity": "severe"})
    res = overview(alice)
    assert res["status"] == "needs_attention"
    issue = res["issues"][0]
    assert issue["section"] == "allergy" and issue["severity"] == "contraindicated"


def test_conditions_personalise_the_result(alice, ref):
    add_med(alice, "Ibuprofen", ref["med"]["ibuprofen"])
    add_med(alice, "Paracetamol", ref["med"]["paracetamol"])
    assert overview(alice)["status"] == "no_matching_record"
    alice.post("/conditions", json={"display_name": "Chronic kidney disease"})
    res = overview(alice)
    assert res["status"] == "needs_attention"
    assert res["issues"][0]["section"] == "drug_condition"
    assert res["context"]["conditions"] == 1


def test_single_medicine_without_context_is_insufficient(alice, ref):
    add_med(alice, "Ibuprofen", ref["med"]["ibuprofen"])
    assert overview(alice)["status"] == "insufficient_data"


def test_no_medicines_is_insufficient(alice, ref):
    res = overview(alice)
    assert res["status"] == "insufficient_data" and res["issues"] == []


def test_overview_lists_what_to_watch_for_serious_first(alice, ref, db):
    add_med(alice, "Ibuprofen", ref["med"]["ibuprofen"])
    add_effect(db, ref, "ibu", "Nausea", "common", "mild")
    add_effect(db, ref, "ibu", "Stomach bleeding", "uncommon", "serious", "Get help now.")
    res = overview(alice)
    effects = res["watch_for"][0]["effects"]
    assert res["watch_for"][0]["medication_name"] == "Ibuprofen"
    assert [e["effect"] for e in effects] == ["Stomach bleeding", "Nausea"]
    assert effects[0]["when_to_get_help"] == "Get help now."
    assert effects[0]["source"]["version"] == "t1"


def test_overview_is_private_to_each_patient(alice, bob, ref):
    add_med(alice, "My ibuprofen", ref["med"]["ibuprofen"])
    add_med(alice, "My aspirin", ref["med"]["aspirin"])
    res = overview(bob)
    assert res["issues"] == [] and res["context"]["medications"] == 0
    assert "My ibuprofen" not in json.dumps(res)


# ----------------------------------------------------------------------- medicine lookup
def test_lookup_checks_one_medicine_against_my_list_without_adding_it(alice, ref):
    add_med(alice, "My aspirin", ref["med"]["aspirin"])
    res = lookup(alice, ref["med"]["ibuprofen"])
    assert res["status"] == "needs_attention"
    assert res["medicine"]["name"] == "Ibuprofen" and res["medicine"]["ingredients"] == [
        "Ibuprofen"
    ]
    f = res["checks"]["drug_drug"]["findings"][0]
    assert set(f["medication_names"]) == {"My aspirin", "Ibuprofen"}
    assert res["already_taking"] is False
    assert alice.get("/medications").json()["total"] == 1  # the lookup did not add it


def test_lookup_uses_conditions_and_allergies(alice, ref):
    alice.post("/conditions", json={"display_name": "Kidney disease"})
    alice.post("/allergies", json={"substance": "Penicillin"})
    kidney = lookup(alice, ref["med"]["ibuprofen"])
    assert kidney["status"] == "needs_attention"
    assert kidney["checks"]["drug_condition"]["findings"][0]["matched_term"] == "Kidney disease"
    pen = lookup(alice, ref["med"]["amoxicillin"])
    assert pen["status"] == "needs_attention"
    assert pen["checks"]["allergy"]["allergy_findings"]


def test_lookup_of_a_medicine_i_already_take_is_not_compared_with_itself(alice, ref):
    add_med(alice, "Ibuprofen", ref["med"]["ibuprofen"])
    res = lookup(alice, ref["med"]["brufen"])  # same ingredient set, different product
    assert res["already_taking"] is True
    assert res["checks"]["drug_drug"]["duplicates"] == []


def test_lookup_with_nothing_to_compare_is_insufficient_and_says_why(alice, ref):
    res = lookup(alice, ref["med"]["paracetamol"])
    assert res["status"] == "insufficient_data"
    assert "no other active medicines" in " ".join(res["checks"]["drug_drug"]["notes"]).lower()


def test_lookup_no_match_against_my_list(alice, ref):
    add_med(alice, "Paracetamol", ref["med"]["paracetamol"])
    res = lookup(alice, ref["med"]["amoxicillin"])
    assert res["status"] == "no_matching_record"
    assert res["counts"] == {"needs_attention": 0, "review": 0}


def test_unmapped_medicine_on_my_list_stops_a_no_match_claim(alice, ref):
    add_med(alice, "Grandma's herbal tonic")
    res = lookup(alice, ref["med"]["amoxicillin"])
    assert res["status"] == "insufficient_data"
    assert "Grandma's herbal tonic" in " ".join(res["checks"]["drug_drug"]["notes"])


def test_lookup_returns_effects_and_general_food_notes(alice, ref, db):
    add_effect(db, ref, "ibu", "Nausea", "common", "mild")
    add_effect(db, ref, "ibu", "Wheeze", "rare", "serious")
    res = lookup(alice, ref["med"]["ibuprofen"])
    assert [e["effect"] for e in res["effects"]] == ["Wheeze", "Nausea"]
    assert res["checks"]["drug_food"]["findings"][0]["matched_term"] == "grapefruit"
    assert res["issues"] == []  # general food notes are not personal findings


def test_lookup_unknown_medicine_is_404(alice, ref):
    r = alice.post("/safety/medicines/00000000-0000-0000-0000-000000000000/personal-check", json={})
    assert r.status_code == 404


def test_retired_effects_disappear(alice, ref, db):
    row = add_effect(db, ref, "ibu", "Nausea")
    assert len(lookup(alice, ref["med"]["ibuprofen"])["effects"]) == 1
    row.status = "retired"
    db.commit()
    assert lookup(alice, ref["med"]["ibuprofen"])["effects"] == []


def test_warnings_endpoint_now_includes_effects(alice, ref, db):
    add_effect(db, ref, "ibu", "Nausea")
    r = alice.get(f"/safety/medicines/{ref['med']['ibuprofen'].id}/warnings")
    assert r.status_code == 200
    assert [e["effect"] for e in r.json()["effects"]] == ["Nausea"]


@pytest.mark.parametrize("path", ["/safety/overview", "/safety/explain"])
def test_personal_endpoints_require_login(app, outbox, path):
    from tests.conftest import Actor

    anon = Actor(app, outbox, "nobody@example.com")
    assert anon.post(path, json={}, csrf=False).status_code == 401


# --------------------------------------------------------------------------- AI explain
def _two_interacting(alice, ref):
    add_med(alice, "My ibuprofen", ref["med"]["ibuprofen"])
    add_med(alice, "My aspirin", ref["med"]["aspirin"])


def test_explain_without_consent_sends_nothing_to_a_model(alice, ref, llm):
    _two_interacting(alice, ref)
    r = alice.post("/safety/explain", json={})
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "consent_required"
    assert "needs attention" in body["text"].lower()
    assert "My ibuprofen" in body["text"]  # the plain summary is still useful
    assert llm.calls == []


def test_explain_with_consent_returns_a_validated_ai_answer(alice, ref, llm, db):
    _two_interacting(alice, ref)
    grant(alice)
    body = alice.post("/safety/explain", json={}).json()
    assert body["mode"] == "ai" and body["status"] == "needs_attention"
    assert "[E1]" in body["text"] and body["evidence"][0]["ref"] == "E1"
    assert body["disclaimer"]
    prompt = llm.calls[0]["user"]
    assert "<evidence" in prompt and "alice@example.com" not in prompt
    log = db.scalar(
        select(ChatContextAccessLog).where(ChatContextAccessLog.purpose == "safety_explain")
    )
    assert log is not None and log.provider == "scripted"


@pytest.mark.parametrize(
    "bad",
    [
        "You should stop taking the ibuprofen now [E1].",  # treatment advice
        "This is a serious problem [E9].",  # citation that does not exist
        "It is flagged but I made no citation at all.",  # patient evidence without a citation
        "Flagged as a major note [E1] and 42 people reported it.",  # invented number
    ],
)
def test_explain_rejects_unsafe_drafts_and_falls_back(alice, ref, llm, bad):
    _two_interacting(alice, ref)
    grant(alice)
    llm.reply = bad
    body = alice.post("/safety/explain", json={}).json()
    assert body["mode"] == "fallback"
    assert bad not in body["text"]
    assert "My ibuprofen" in body["text"]


def test_explain_falls_back_when_the_provider_fails(alice, ref, llm):
    _two_interacting(alice, ref)
    grant(alice)
    llm.reply = LLMUnavailable("down", ("scripted",))
    assert alice.post("/safety/explain", json={}).json()["mode"] == "fallback"


def test_explain_without_a_model_is_plain_evidence(alice, ref, llm):
    _two_interacting(alice, ref)
    grant(alice)
    llm.configured = False
    body = alice.post("/safety/explain", json={}).json()
    assert body["mode"] == "evidence_only" and llm.calls == []


def test_explain_with_nothing_to_explain_does_not_call_the_model(alice, ref, llm):
    grant(alice)
    body = alice.post("/safety/explain", json={}).json()
    assert body["mode"] == "evidence_only" and body["evidence"] == [] and llm.calls == []


def test_explain_one_looked_up_medicine_includes_its_effects(alice, ref, llm, db):
    add_med(alice, "My aspirin", ref["med"]["aspirin"])
    add_effect(db, ref, "ibu", "Stomach bleeding", "uncommon", "serious")
    grant(alice)
    body = alice.post(
        "/safety/explain", json={"medicine_id": str(ref["med"]["ibuprofen"].id)}
    ).json()
    assert body["mode"] == "ai"
    assert any("Stomach bleeding" in e["text"] for e in body["evidence"])


def test_explain_audit_trail_holds_counts_only(alice, ref, llm, db):
    _two_interacting(alice, ref)
    grant(alice)
    alice.post("/safety/explain", json={})
    alice.post("/safety/overview", json={})
    rows = db.scalars(select(AuditLog).where(AuditLog.action.like("safety.%"))).all()
    assert {r.action for r in rows} >= {"safety.explain", "safety.overview"}
    dumped = json.dumps([r.event_metadata for r in rows])
    assert "buprofen" not in dumped and "spirin" not in dumped


# ----------------------------------------------------------------------- admin curation
def test_admin_curates_adverse_effects(admin, alice, ref, db):
    body = {
        "ingredient_id": str(ref["ing"]["ibu"].id),
        "effect": "Dizziness",
        "frequency": "uncommon",
        "seriousness": "mild",
        "source_id": str(ref["src"].id),
        "source_version": "t1",
        "reviewed_at": "2026-11-01",
        "jurisdiction": "IN",
    }
    assert alice.post("/admin/adverse-effects", json=body).status_code == 403
    created = admin.post("/admin/adverse-effects", json=body)
    assert created.status_code == 201, created.text
    assert admin.post("/admin/adverse-effects", json=body).status_code == 409
    assert admin.get("/admin/adverse-effects").json()["total"] == 1
    assert lookup(alice, ref["med"]["ibuprofen"])["effects"][0]["effect"] == "Dizziness"
    retired = admin.post(f"/admin/adverse-effects/{created.json()['id']}/retire")
    assert retired.json()["status"] == "retired"
    assert lookup(alice, ref["med"]["ibuprofen"])["effects"] == []
    bad = {**body, "frequency": "always"}
    assert admin.post("/admin/adverse-effects", json=bad).status_code == 422


# ------------------------------------------------------------------- pure logic (no HTTP)
def _result(outcome, findings=(), allergies=(), duplicates=()):
    return eng.CheckResult(
        outcome=outcome,
        findings=list(findings),
        allergy_findings=list(allergies),
        duplicates=list(duplicates),
    )


def _finding(severity):
    src = eng.Source("S", "1", date(2026, 11, 1), "IN")
    return eng.Finding("r", "drug_drug", severity, "d", None, None, src, [], ["A", "B"], ["a", "b"])


def test_status_levels():
    assert asm.status_for([_result(eng.FINDINGS, [_finding("major")])]) == asm.NEEDS_ATTENTION
    assert (
        asm.status_for([_result(eng.FINDINGS, [_finding("contraindicated")])]) == "needs_attention"
    )
    assert asm.status_for([_result(eng.FINDINGS, [_finding("moderate")])]) == asm.REVIEW
    assert asm.status_for([_result(eng.FINDINGS, [_finding("unknown")])]) == asm.REVIEW
    assert asm.status_for([_result(eng.NO_MATCH), _result(eng.INSUFFICIENT)]) == asm.NO_MATCH
    assert asm.status_for([_result(eng.INSUFFICIENT)]) == asm.INSUFFICIENT
    assert asm.status_for([]) == asm.INSUFFICIENT


def test_issues_are_ordered_most_serious_first():
    out = asm.issues_from(
        {
            "drug_drug": _result(
                eng.FINDINGS, [_finding("minor"), _finding("contraindicated"), _finding("moderate")]
            )
        }
    )
    assert [i.severity for i in out] == ["contraindicated", "moderate", "minor"]
    assert asm.counts(out) == {"needs_attention": 1, "review": 2}


def test_effects_sort_serious_then_frequent():
    src = eng.Source("S", "1", date(2026, 11, 1), "IN")

    def e(name, freq, ser):
        return asm.Effect(name, "i", "Drug", name, freq, ser, None, src)

    ordered = asm.sort_effects(
        [e("b", "common", "mild"), e("a", "very_common", "mild"), e("z", "rare", "serious")]
    )
    assert [x.effect for x in ordered] == ["z", "a", "b"]


def test_people_write_pregnant_not_pregnancy():
    assert eng.contains_term("I am pregnant", "pregnancy")
    assert not eng.contains_term("pre", "pregnancy")
