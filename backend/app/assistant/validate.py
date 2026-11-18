"""Checks on a model draft before it is shown. The model's output is untrusted.

A draft is rejected (and replaced by the plain evidence listing) when it:
- cites an evidence reference that does not exist, or cites nothing although patient evidence
  was supplied;
- contains a number that appears neither in the evidence nor in the patient's question
  (an invented value, date or count);
- tells the patient to start, stop or change a medicine or dose, or states that a medicine "is
  working" / "is not working" (causal or treatment claims);
- is empty or unreasonably long.

This is defence in depth on top of the system prompt and the pre-model policy, and it errs on
the side of falling back: a rejected draft costs the patient a plainer answer, never a wrong one.
"""

import re
from dataclasses import dataclass

from app.assistant.evidence import Bundle, numbers_in

MAX_ANSWER_CHARS = 1800
_CITE = re.compile(r"\[E(\d+)\]")

_ADVICE = [
    # "take" alone is advice ("you should take 2"), but "take advice / take this to your
    # pharmacist" is exactly what we want the model to say, so those are not matched.
    r"\byou (should|must|need to|ought to|have to) (now )?(stop|start|begin|increase|decrease|"
    r"reduce|raise|lower|double|halve|skip|switch|change|"
    r"take(?! (advice|care|a look|a note|note of|your time|a moment|this|these|that|it to|"
    r"them to|the records)))\b",
    r"(?<!not )(?<!n't )(?<!never )\b(increase|decrease|reduce|double|halve|raise|lower) "
    r"(your|the) (dose|dosage)\b",
    r"\b(i|we) (recommend|suggest|advise|prescribe)\b",
    r"\b(is|are|was|were|has been|have been) (clearly |definitely |probably |likely )?"
    r"(working|effective|ineffective|helping|not working|not helping)\b",
    r"\b(you (probably |likely |definitely )?have|you are suffering from|you suffer from|"
    r"your diagnosis is) (diabetes|hypertension|anaemia|anemia|hypothyroidism|"
    r"hyperthyroidism|kidney disease|cancer|an infection|heart disease)\b",
    r"\bbecause (of )?(your|the) (medicine|medication|tablet|pill|drug)\b",
]
_ADVICE_RE = [re.compile(p, re.IGNORECASE) for p in _ADVICE]
ADVICE_PATTERNS = _ADVICE_RE  # reused by other modules that screen model wording


@dataclass(frozen=True)
class Validation:
    ok: bool
    reasons: tuple[str, ...] = ()


def validate_answer(text: str, bundle: Bundle, question: str) -> Validation:
    reasons: list[str] = []
    stripped = text.strip()
    if not stripped:
        return Validation(False, ("empty",))
    if len(stripped) > MAX_ANSWER_CHARS:
        reasons.append("too_long")

    cited = {f"E{n}" for n in _CITE.findall(stripped)}
    unknown = cited - bundle.refs
    if unknown:
        reasons.append("unknown_citation")
    if bundle.has_patient_data and not cited:
        reasons.append("no_citation")

    body = _CITE.sub("", stripped)
    allowed = numbers_in(bundle.text) | numbers_in(question)
    if numbers_in(body) - allowed:
        reasons.append("unsupported_number")

    if any(p.search(body) for p in _ADVICE_RE):
        reasons.append("advice_or_causal_claim")
    return Validation(not reasons, tuple(reasons))
