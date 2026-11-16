"""Pure, deterministic meal-idea planner and review screening. No database, no model, no clock.

Principles (PRD FR-13):
* General educational ideas only: no portions, calories, nutrient targets or health claims.
* Say which constraints were used, and which could not be applied.
* Never relax a constraint to fill a slot: an empty slot is shown as empty.
* Screen for situations that need a clinician or dietitian. Some of them (eating disorder
  history, kidney disease, a child) mean no plan is produced at all.
"""

import re
from dataclasses import dataclass, field

from app.nutrition.catalogue import (
    CATALOGUE_VERSION,
    DIET_EXCLUDES,
    GROUP_TERMS,
    IDEAS,
    KNOWN_WORDS,
    WORD_TAGS,
    MealIdea,
    tokens,
)

DAYS = 7
SLOT_ORDER = {
    2: ("lunch", "dinner"),
    3: ("breakfast", "lunch", "dinner"),
    4: ("breakfast", "lunch", "snack", "dinner"),
    5: ("breakfast", "snack", "lunch", "snack", "dinner"),
}

DIET_NOTICE = (
    "These are general meal ideas for learning and planning. They are not a prescription or a "
    "treatment diet, they do not count calories or nutrients, and they are not adjusted for your "
    "health. Talk to a doctor or registered dietitian before changing what you eat for a health "
    "reason."
)

_KIDNEY = re.compile(r"\b(kidney|renal|ckd|dialysis|nephr\w*)\b", re.I)
_EATING = re.compile(r"\b(eating disorder|anorexi\w*|bulimi\w*|binge[- ]eating)\b", re.I)
_PREGNANCY = re.compile(r"\b(pregnan\w*|breastfeed\w*|lactating|lactation)\b", re.I)


@dataclass(frozen=True)
class Flag:
    code: str
    severity: str  # block | review | info
    message: str


@dataclass(frozen=True)
class Prefs:
    diet_type: str
    cuisine: str
    meals_per_day: int
    avoid_foods: tuple[str, ...] = ()
    situations: tuple[str, ...] = ()


@dataclass
class PlanResult:
    days: list[dict]
    constraints_used: dict
    flags: list[Flag] = field(default_factory=list)


# ------------------------------------------------------------------------------ screening
def screen(prefs: Prefs, condition_names: list[str], active_medicines: int) -> list[Flag]:
    """Review flags from what the patient said and what their profile records. Always run, even
    for conditions the patient did not mention here: protection does not depend on opting in."""
    flags: list[Flag] = []
    names = " ; ".join(condition_names)
    sit = set(prefs.situations)

    if "eating_disorder_history" in sit or _EATING.search(names):
        flags.append(
            Flag(
                "eating_disorder",
                "block",
                "Meal plans are not offered when there is a history of an eating disorder. "
                "Please talk to your clinician or a registered dietitian.",
            )
        )
    if "kidney_disease" in sit or _KIDNEY.search(names):
        flags.append(
            Flag(
                "kidney_disease",
                "block",
                "Kidney conditions need a diet set by your care team, so no plan is offered here. "
                "Please ask your doctor or a renal dietitian.",
            )
        )
    if "child_under_12" in sit:
        flags.append(
            Flag(
                "child",
                "block",
                "This tool is for adults. A child's diet should be planned with a paediatrician "
                "or dietitian.",
            )
        )
    if "pregnant_or_breastfeeding" in sit or _PREGNANCY.search(names):
        flags.append(
            Flag(
                "pregnancy",
                "review",
                "Needs are different during pregnancy and breastfeeding. Check these ideas with "
                "your doctor or a dietitian.",
            )
        )
    if "clinician_diet" in sit:
        flags.append(
            Flag(
                "clinician_diet",
                "review",
                "Follow the diet your clinician gave you. These ideas are not adjusted to it.",
            )
        )
    if len(condition_names) >= 2:
        flags.append(
            Flag(
                "multiple_conditions",
                "review",
                "You have more than one active condition recorded. Please have a doctor or "
                "dietitian review any change to your diet.",
            )
        )
    elif len(condition_names) == 1:
        flags.append(
            Flag(
                "condition_recorded",
                "info",
                "You have an active condition recorded. These ideas are general and are not "
                "adjusted for it.",
            )
        )
    if active_medicines:
        flags.append(
            Flag(
                "medicines_recorded",
                "review",
                "You have medicines recorded. Some foods affect some medicines: use the food check "
                "in Medicine safety and ask your pharmacist.",
            )
        )
    return flags


def blocking(flags: list[Flag]) -> Flag | None:
    return next((f for f in flags if f.severity == "block"), None)


# -------------------------------------------------------------------------------- matching
def _term_tags(term: str) -> tuple[frozenset[str], tuple[str, ...]]:
    toks = tokens(term)
    tags: set[str] = set()
    for tok in toks:
        tags |= WORD_TAGS.get(tok, frozenset())
        tags |= GROUP_TERMS.get(tok, frozenset())
    if len(toks) > 1:
        tags |= GROUP_TERMS.get(" ".join(toks), frozenset())
    return frozenset(tags), toks


def recognised(term: str) -> bool:
    return any(tok in KNOWN_WORDS for tok in tokens(term))


def violates(idea: MealIdea, term: str) -> bool:
    """True when the idea contains the term. Matching is by whole word and by the dietary tag the
    word implies, so it can remove an idea that merely shares a word (the safe direction)."""
    tags, toks = _term_tags(term)
    if tags & idea.tags:
        return True
    return bool(toks) and all(t in idea.words for t in toks)


def _clean_terms(values) -> list[str]:
    out: list[str] = []
    for v in values:
        v = " ".join(str(v).split()).lower()
        if v and v not in out:
            out.append(v)
    return out


# ----------------------------------------------------------------------------------- plan
def eligible(prefs: Prefs, avoid: list[str]) -> list[MealIdea]:
    excluded = DIET_EXCLUDES[prefs.diet_type]
    out = []
    for idea in IDEAS:
        if idea.tags & excluded:
            continue
        if prefs.cuisine != "general" and not (
            prefs.cuisine in idea.cuisines or "general" in idea.cuisines
        ):
            continue
        if any(violates(idea, term) for term in avoid):
            continue
        out.append(idea)
    return sorted(out, key=lambda i: i.id)


def build_plan(prefs: Prefs, allergies: list[str]) -> PlanResult:
    """`allergies` are the patient's recorded allergy substances: always applied, whether or not
    they are in the preference list."""
    avoid = _clean_terms(prefs.avoid_foods)
    allergy_terms = [a for a in _clean_terms(allergies) if a not in avoid]
    applied = [a for a in allergy_terms if recognised(a)]
    not_matched = [a for a in allergy_terms if not recognised(a)]
    avoid_not_matched = [a for a in avoid if not recognised(a)]

    pool = eligible(prefs, avoid + applied)
    slots = SLOT_ORDER[prefs.meals_per_day]
    flags: list[Flag] = []
    gaps = 0

    days = []
    for d in range(DAYS):
        used: set[str] = set()
        meals = []
        for position, slot in enumerate(slots):
            candidates = [i for i in pool if slot in i.slots]
            if not candidates:
                gaps += 1
                meals.append(
                    {
                        "slot": slot,
                        "idea_id": None,
                        "name": None,
                        "description": (
                            "No idea in our small collection fits your choices for this meal."
                        ),
                        "ingredients": [],
                    }
                )
                continue
            n = len(candidates)
            pick = candidates[(d + position * 3) % n]
            for k in range(n):  # avoid repeating an idea within the same day when there is a choice
                trial = candidates[(d + position * 3 + k) % n]
                if trial.id not in used:
                    pick = trial
                    break
            used.add(pick.id)
            meals.append(
                {
                    "slot": slot,
                    "idea_id": pick.id,
                    "name": pick.name,
                    "description": pick.description,
                    "ingredients": list(pick.ingredients),
                }
            )
        days.append({"day": d + 1, "meals": meals})

    if gaps:
        flags.append(
            Flag(
                "limited_options",
                "info",
                "Some meals are empty because nothing in our small collection fits your choices. "
                "We do not loosen your choices to fill them.",
            )
        )
    if not_matched:
        flags.append(
            Flag(
                "allergy_not_checked",
                "review",
                "These recorded allergies are not foods we can match, so ideas were not filtered "
                "for them: " + ", ".join(not_matched) + ".",
            )
        )
    if avoid_not_matched:
        flags.append(
            Flag(
                "avoid_not_checked",
                "review",
                "We do not recognise these foods, so ideas were not filtered for them: "
                + ", ".join(avoid_not_matched)
                + ". Check every idea yourself.",
            )
        )

    constraints = {
        "diet_type": prefs.diet_type,
        "cuisine": prefs.cuisine,
        "meals_per_day": prefs.meals_per_day,
        "avoid_foods": avoid,
        "allergies_applied": applied,
        "allergies_not_matched": not_matched,
        "avoid_not_matched": avoid_not_matched,
        "ideas_available": len(pool),
    }
    return PlanResult(days=days, constraints_used=constraints, flags=flags)


def limitations() -> list[str]:
    return [
        f"Ideas come from a small built-in collection ({len(IDEAS)} ideas, version "
        f"{CATALOGUE_VERSION}) and repeat across the week.",
        "Foods you avoid are matched against the ingredient names listed for each idea. A match "
        "on a "
        "shared word can remove an idea that is actually fine. Always read food labels.",
        "No portions, calories or nutrient targets are given.",
    ]
