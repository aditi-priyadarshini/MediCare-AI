"""Safety engine and comparison logic: pure functions, no database."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from app.safety import comparison as cmp
from app.safety import engine as eng

SRC = eng.Source("Demo dataset", "v1", date(2026, 11, 1), "IN")
OTHER_SRC = eng.Source("Other dataset", "v2", date(2026, 10, 1), "IN")


def ing(i, name, drug_class=None, terms=()):
    return eng.Ingredient(i, name, drug_class, tuple(terms), SRC)


INGS = {
    "a": ing("a", "Ibuprofen", "nsaid", ("nsaid",)),
    "b": ing("b", "Aspirin", "nsaid", ("salicylate",)),
    "c": ing("c", "Paracetamol"),
    "d": ing("d", "Amoxicillin", "penicillin", ("penicillin",)),
}


def rule(rid, kind, a, b=None, term=None, severity="moderate", source=SRC):
    return eng.Rule(rid, kind, a, b, term, severity, f"desc {rid}", None, None, source)


def med(i, name, *ingredient_ids):
    return eng.PatientMed(i, name, tuple(ingredient_ids))


# ------------------------------------------------------------------------------ drug-drug
def test_pair_matches_in_either_order():
    rules = [rule("r1", "drug_drug", "a", "b")]
    forward = eng.check_drug_drug([med("m1", "X", "a"), med("m2", "Y", "b")], rules, INGS)
    backward = eng.check_drug_drug([med("m1", "Y", "b"), med("m2", "X", "a")], rules, INGS)
    assert forward.outcome == backward.outcome == eng.FINDINGS
    assert len(forward.findings) == len(backward.findings) == 1


def test_finding_carries_source_metadata():
    res = eng.check_drug_drug(
        [med("m1", "X", "a"), med("m2", "Y", "b")], [rule("r1", "drug_drug", "a", "b")], INGS
    )
    f = res.findings[0]
    assert (f.source.name, f.source.version, f.source.jurisdiction) == ("Demo dataset", "v1", "IN")
    assert f.source.reviewed_at == date(2026, 11, 1)


def test_no_matching_rule_is_not_safe():
    res = eng.check_drug_drug([med("m1", "X", "a"), med("m2", "Y", "c")], [], INGS)
    assert res.outcome == eng.NO_MATCH
    assert not res.findings
    assert "does not mean" in " ".join(res.notes)


def test_unmapped_medicine_makes_result_insufficient():
    res = eng.check_drug_drug([med("m1", "X", "a"), med("m2", "Mystery")], [], INGS)
    assert res.outcome == eng.INSUFFICIENT
    assert res.unmapped_medications == ["Mystery"]


def test_findings_survive_an_unmapped_medicine():
    rules = [rule("r1", "drug_drug", "a", "b")]
    meds = [med("m1", "X", "a"), med("m2", "Y", "b"), med("m3", "Mystery")]
    res = eng.check_drug_drug(meds, rules, INGS)
    assert res.outcome == eng.FINDINGS
    assert res.unmapped_medications == ["Mystery"]


def test_single_medicine_is_insufficient():
    res = eng.check_drug_drug([med("m1", "X", "a")], [], INGS)
    assert res.outcome == eng.INSUFFICIENT


def test_conflicting_sources_are_both_shown_and_flagged():
    rules = [
        rule("r1", "drug_drug", "a", "b", severity="minor", source=SRC),
        rule("r2", "drug_drug", "a", "b", severity="major", source=OTHER_SRC),
    ]
    res = eng.check_drug_drug([med("m1", "X", "a"), med("m2", "Y", "b")], rules, INGS)
    assert [f.severity for f in res.findings] == ["major", "minor"]  # most severe first
    assert all(f.conflict for f in res.findings)


def test_agreeing_sources_are_not_a_conflict():
    rules = [
        rule("r1", "drug_drug", "a", "b", source=SRC),
        rule("r2", "drug_drug", "a", "b", source=OTHER_SRC),
    ]
    res = eng.check_drug_drug([med("m1", "X", "a"), med("m2", "Y", "b")], rules, INGS)
    assert len(res.findings) == 2 and not any(f.conflict for f in res.findings)


def test_unknown_severity_is_reported_as_unknown():
    res = eng.check_drug_drug(
        [med("m1", "X", "a"), med("m2", "Y", "b")],
        [rule("r1", "drug_drug", "a", "b", severity="unknown")],
        INGS,
    )
    assert res.findings[0].severity == "unknown"


def test_duplicate_ingredient_is_flagged_without_a_rule():
    res = eng.check_drug_drug([med("m1", "Brand A", "c"), med("m2", "Brand B", "c")], [], INGS)
    assert [d.ingredient_name for d in res.duplicates] == ["Paracetamol"]
    assert res.outcome == eng.NO_MATCH


def test_combination_product_checks_each_ingredient():
    rules = [rule("r1", "drug_drug", "a", "d")]
    res = eng.check_drug_drug([med("m1", "Combo", "a", "c"), med("m2", "Y", "d")], rules, INGS)
    assert res.outcome == eng.FINDINGS


# --------------------------------------------------------------------- condition and food
def term(i, text, code=None):
    return eng.PatientTerm(i, text, code)


def test_condition_matches_whole_words_only():
    rules = [rule("r1", "drug_condition", "a", term="kidney disease", severity="major")]
    meds = [med("m1", "X", "a")]
    hit = eng.check_by_term(
        meds, rules, INGS, "drug_condition", [term("c1", "Chronic kidney disease")]
    )
    assert hit.outcome == eng.FINDINGS and hit.findings[0].matched_term == "Chronic kidney disease"
    miss = eng.check_by_term(meds, rules, INGS, "drug_condition", [term("c2", "Kidney stones")])
    assert miss.outcome == eng.NO_MATCH


def test_condition_matches_on_code():
    rules = [rule("r1", "drug_condition", "a", term="N18")]
    res = eng.check_by_term(
        [med("m1", "X", "a")], rules, INGS, "drug_condition", [term("c1", "CKD", code="N18")]
    )
    assert res.outcome == eng.FINDINGS


def test_no_conditions_recorded_is_insufficient_not_clear():
    res = eng.check_by_term(
        [med("m1", "X", "a")],
        [rule("r1", "drug_condition", "a", term="x")],
        INGS,
        "drug_condition",
        [],
    )
    assert res.outcome == eng.INSUFFICIENT


def test_condition_rule_for_other_ingredient_is_ignored():
    rules = [rule("r1", "drug_condition", "b", term="asthma")]
    res = eng.check_by_term(
        [med("m1", "X", "a")], rules, INGS, "drug_condition", [term("c1", "asthma")]
    )
    assert res.outcome == eng.NO_MATCH


def test_food_without_terms_lists_all_notes_for_the_medicines():
    rules = [
        rule("r1", "drug_food", "a", term="alcohol"),
        rule("r2", "drug_food", "b", term="milk"),
    ]
    res = eng.check_by_term([med("m1", "X", "a")], rules, INGS, "drug_food", None)
    assert [f.matched_term for f in res.findings] == ["alcohol"]


def test_food_with_terms_filters():
    rules = [
        rule("r1", "drug_food", "a", term="alcohol"),
        rule("r2", "drug_food", "a", term="grapefruit"),
    ]
    res = eng.check_by_term(
        [med("m1", "X", "a")], rules, INGS, "drug_food", [term("f1", "grapefruit juice")]
    )
    assert [f.matched_term for f in res.findings] == ["grapefruit juice"]


# ----------------------------------------------------------------------------- allergies
def test_allergy_matches_by_name_term_and_class():
    meds = [med("m1", "Amox", "d"), med("m2", "Brufen", "a"), med("m3", "Para", "c")]
    allergies = [term("a1", "Penicillin allergy"), term("a2", "ibuprofen"), term("a3", "NSAIDs")]
    res = eng.check_allergies(meds, INGS, allergies)
    got = {(f.allergy_text, f.ingredient_name): f.basis for f in res.allergy_findings}
    assert got[("Penicillin allergy", "Amoxicillin")] == "curated_term"
    assert got[("ibuprofen", "Ibuprofen")] == "ingredient_name"
    assert got[("NSAIDs", "Ibuprofen")] == "curated_term"
    assert all(f.medication_name != "Para" for f in res.allergy_findings)
    assert res.outcome == eng.FINDINGS


def test_allergy_class_match_when_no_curated_term():
    ingredients = {"x": ing("x", "Zeta", "macrolide")}
    res = eng.check_allergies(
        [med("m1", "Z", "x")], ingredients, [term("a1", "macrolide antibiotics")]
    )
    assert res.allergy_findings[0].basis == "drug_class"


def test_no_allergies_recorded_means_unknown():
    res = eng.check_allergies([med("m1", "X", "a")], INGS, [])
    assert res.outcome == eng.INSUFFICIENT
    assert "unknown" in " ".join(res.notes)


def test_allergy_with_no_match_is_not_declared_safe():
    res = eng.check_allergies([med("m1", "P", "c")], INGS, [term("a1", "peanuts")])
    assert res.outcome == eng.NO_MATCH


def test_normalize_and_contains_term():
    assert eng.normalize("  Type-2   Diabetes! ") == "type 2 diabetes"
    assert eng.contains_term("Type 2 diabetes", "diabetes")
    assert not eng.contains_term("pregnant", "pre")
    assert eng.contains_term("NSAIDs", "nsaid") and eng.contains_term("nsaid", "NSAIDs")
    assert not eng.contains_term("anything", "")


# ------------------------------------------------------------------------- alternatives
def comp(i, name, *parts, form="tablet", route="oral", release="immediate", strength="500 mg"):
    return cmp.Composition(
        i,
        name,
        form,
        strength,
        route,
        release,
        tuple(cmp.Component(p, Decimal(v), u) for p, v, u in parts),
    )


def test_candidates_need_identical_composition_form_route_and_release():
    src = comp("1", "Brand", ("a", "500", "mg"))
    pool = [
        comp("2", "Generic", ("a", "500.0", "MG")),  # same, formatted differently
        comp("3", "Stronger", ("a", "650", "mg")),
        comp("4", "Capsule", ("a", "500", "mg"), form="capsule"),
        comp("5", "Slow", ("a", "500", "mg"), release="extended"),
        comp("6", "Combo", ("a", "500", "mg"), ("c", "10", "mg")),
    ]
    res = cmp.find_candidates(src, pool + [src])
    assert res.status == "candidates"
    assert [c.composition.name for c in res.candidates] == ["Generic"]
    assert "Different product name" in res.candidates[0].differences


def test_source_with_missing_data_gets_insufficient_not_guesses():
    src = comp("1", "Brand", ("a", "500", "mg"), release=None)
    res = cmp.find_candidates(src, [comp("2", "Generic", ("a", "500", "mg"))])
    assert res.status == "insufficient_data" and res.missing == ["release type"]
    assert not res.candidates


def test_source_without_ingredients_is_insufficient():
    res = cmp.find_candidates(comp("1", "Brand"), [])
    assert res.status == "insufficient_data" and "active ingredients" in res.missing


def test_incomplete_pool_entries_are_excluded_and_counted():
    src = comp("1", "Brand", ("a", "500", "mg"))
    res = cmp.find_candidates(src, [comp("2", "Gap", ("a", "500", "mg"), route=None)])
    assert res.status == "no_candidates" and res.excluded_incomplete == 1


def test_unit_price_and_age():
    assert cmp.unit_price(Decimal("30"), Decimal("10")) == Decimal("3.0000")
    assert cmp.unit_price(Decimal("10"), Decimal("3")) == Decimal("3.3333")
    now = datetime(2026, 11, 15, tzinfo=UTC)
    assert cmp.age_days(now - timedelta(days=100), now) == 100
    assert cmp.age_days(now + timedelta(days=1), now) == 0
