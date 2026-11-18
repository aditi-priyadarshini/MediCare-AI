"""Helpers shared by the AI safety modules (pairs, full review, generic alternatives).

Everything the model returns is an untrusted draft. This module holds the pieces that make that
safe in one place, so the three AI endpoints cannot drift apart:

* ``clean_name``      free text from the patient or the model, reduced to a harmless label;
* ``extract_json``    the JSON object in a model reply (it may arrive in a code fence);
* ``note_is_safe``    the wording check: no doses, numbers, times, "it is safe", or instructions to
                      start, stop, skip, avoid or change anything;
* ``run_calls``       several model calls at once. Only the HTTP call runs in a worker thread; no
                      database session is ever touched off the request thread.
"""

import json
import re
from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

from app.assistant.provider import LLMResult, LLMUnavailable
from app.assistant.validate import ADVICE_PATTERNS

MAX_NOTE_CHARS = 240
MAX_PARALLEL_CALLS = 4

_NAME_KEEP = re.compile(r"[^\w\s().+%/-]")

_SAFE_WORDS = re.compile(r"\b(safe|safely|no risk|risk[- ]free|harmless|fine to)\b", re.I)
_VERBS = (
    r"(stop|start|skip|avoid|discontinue|separate|space|increase|decrease|"
    r"reduce|take|use|combine)"
)
_INSTRUCTION = re.compile(
    rf"(^|[.;:!]\s*){_VERBS}\b|\b(and|or|then|but) {_VERBS}\b|"
    r"\b(should|must|shouldn't|mustn't|need to|needs to|do not|don't|never)\b",
    re.I,
)


def clean_name(name: str, limit: int = 60) -> str:
    """A label that is safe to put inside a prompt: letters, digits and a few punctuation marks."""
    return " ".join(_NAME_KEEP.sub(" ", name).split())[:limit] or "unnamed"


def note_is_safe(note: str) -> bool:
    """The model's wording must not carry doses, numbers, or treatment instructions."""
    if len(note) > MAX_NOTE_CHARS or re.search(r"\d", note):
        return False
    if _SAFE_WORDS.search(note):
        return False
    if any(p.search(note) for p in ADVICE_PATTERNS):
        return False
    # Describing an effect ("may increase the risk") is fine; telling the patient what to do isn't.
    return not _INSTRUCTION.search(note)


def extract_json(text: str) -> object | None:
    """The first JSON value in a model reply, or None. Tolerates a code fence or chatter."""
    body = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", body, re.S)
    if fence:
        body = fence.group(1).strip()
    try:
        return json.loads(body)
    except ValueError:
        brace = re.search(r"\{.*\}", body, re.S)
        if not brace:
            return None
        try:
            return json.loads(brace.group(0))
        except ValueError:
            return None


def as_index(value: object, valid: set[int]) -> int | None:
    """A JSON number that is a real, allowed index. Booleans are numbers in Python; not here."""
    if isinstance(value, bool) or not isinstance(value, int) or value not in valid:
        return None
    return value


@dataclass(frozen=True)
class CallSpec:
    system: str
    user: str
    max_tokens: int


@dataclass
class CallOutcome:
    result: LLMResult | None = None
    error: LLMUnavailable | None = None


def run_calls(llm, specs: Sequence[CallSpec]) -> list[CallOutcome]:
    """Run the calls concurrently, keeping the order. A failure is returned, never raised, so one
    bad chunk cannot discard the chunks that worked."""

    def one(spec: CallSpec) -> CallOutcome:
        try:
            return CallOutcome(
                result=llm.complete(system=spec.system, user=spec.user, max_tokens=spec.max_tokens)
            )
        except LLMUnavailable as exc:
            return CallOutcome(error=exc)

    if len(specs) <= 1:
        return [one(s) for s in specs]
    with ThreadPoolExecutor(max_workers=min(MAX_PARALLEL_CALLS, len(specs))) as pool:
        return list(pool.map(one, specs))


def contacted_providers(outcomes: Sequence[CallOutcome]) -> list[str]:
    """Every vendor that was sent anything, in first-seen order (the disclosure log lists all)."""
    seen: list[str] = []
    for o in outcomes:
        if o.result is not None:
            names = o.result.attempted or (o.result.provider,)
        else:
            names = o.error.attempted if o.error else ()
        seen += [n for n in names if n not in seen]
    return seen
