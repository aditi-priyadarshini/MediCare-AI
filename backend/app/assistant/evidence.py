"""Evidence items: the only patient facts the assistant may state.

Pure functions over plain dataclasses (no database, no clock, no I/O) so every rule here is unit
tested directly. The retrieval layer loads rows and hands them to these builders.

Rules encoded here (docs/MEMORY.md sections 5, 6, 9):
- every item says where it came from, its date and how verified it is;
- a change between lab results is only calculated for the same test in the same unit, with
  numeric values; otherwise the results are listed separately and flagged "not comparable";
- two different values for the same test on the same day are shown as a conflict, never merged;
- missing data is stated, never filled in;
- free text typed by a patient or extracted from a document is untrusted. It is cleaned, length
  limited, and withheld entirely if it looks like an instruction to the assistant. The text of
  uploaded files is never used at all.
"""

import html
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

VERIFICATION_LABEL = {
    "patient_reported": "entered by the patient",
    "clinician_confirmed": "confirmed by a clinician",
    "imported": "imported",
    "unverified": "not verified",
}

SOURCE_TYPES = (
    "lab_result",
    "medication",
    "dose_log",
    "condition",
    "allergy",
    "health_record",
    "reference",
    "derived",
)

_INJECTION = [
    r"ignore (all |any |the |your )?(previous|prior|above|earlier|preceding)",
    r"disregard (all |any |the |your )?(previous|prior|above|earlier|instructions?|rules)",
    r"forget (all |any |the |your )?(previous|prior|above|earlier|instructions?|rules)",
    r"\b(system|developer|assistant) ?(prompt|message|instructions?)\b",
    r"^\s*(system|assistant|developer)\s*:",
    r"\byou are (now |no longer )?(an? )?(ai|assistant|chatbot|model|doctor|physician)\b",
    r"\b(new|updated|revised|real) instructions?\b",
    r"</?\s*(evidence|system|instructions?|question|assistant)\b",
    r"\bact as\b",
    r"\b(reveal|print|repeat|show) (me )?(your |the )?(system |hidden )?(prompt|instructions)\b",
    r"\bdo not (tell|inform|mention|warn)\b",
    r"\boverride\b",
    r"\bjailbreak\b",
]
_INJECTION_RE = [re.compile(p, re.IGNORECASE | re.MULTILINE) for p in _INJECTION]
_INVISIBLE = re.compile(r"[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]")


def looks_injected(text: str) -> bool:
    return any(p.search(text) for p in _INJECTION_RE)


def sanitize(text: str | None, limit: int) -> str:
    """Strip control and invisible characters, flatten whitespace and cap the length."""
    if not text:
        return ""
    cleaned = _INVISIBLE.sub("", text)
    cleaned = "".join(" " if unicodedata.category(c).startswith("C") else c for c in cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned if len(cleaned) <= limit else cleaned[: limit - 1].rstrip() + "…"


def free_text(text: str | None, limit: int) -> tuple[str | None, bool]:
    """Returns (usable text or None, withheld). Instruction-like text is withheld whole."""
    cleaned = sanitize(text, limit)
    if not cleaned:
        return None, False
    if looks_injected(text or "") or looks_injected(cleaned):
        return None, True
    return cleaned, False


def fmt_num(value) -> str:
    if value is None:
        return ""
    d = Decimal(str(value))
    if d == d.to_integral():
        return format(d.quantize(Decimal(1)), "f")
    return format(d.normalize(), "f")


def norm_name(text: str) -> str:
    return re.sub(r"\s+", " ", text.casefold()).strip()


def norm_unit(unit: str | None) -> str:
    return re.sub(r"\s+", "", (unit or "").casefold())


# ----------------------------------------------------------------------------------- types
@dataclass(frozen=True)
class EvidenceItem:
    ref: str
    source_type: str
    source_record_id: str | None
    label: str
    text: str
    recorded_at: date | None = None
    verification_status: str | None = None


@dataclass(frozen=True)
class LabPoint:
    id: str
    test_name: str
    value_numeric: Decimal | None
    value_text: str | None
    unit: str | None
    ref_low: Decimal | None
    ref_high: Decimal | None
    flag: str
    observed_on: date
    verification_status: str
    notes: str | None = None


@dataclass(frozen=True)
class MedPoint:
    id: str
    name: str
    strength: str | None
    form: str | None
    dose_text: str | None
    basis: str
    status: str
    start_date: date | None
    end_date: date | None
    reason: str | None
    verification_status: str


@dataclass(frozen=True)
class DoseSummary:
    medication_id: str
    medication_name: str
    days: int
    taken: int
    skipped: int
    unmarked_past: int
    last_taken_on: date | None


@dataclass(frozen=True)
class ConditionPoint:
    id: str
    name: str
    status: str
    onset_date: date | None
    verification_status: str


@dataclass(frozen=True)
class AllergyPoint:
    id: str
    substance: str
    reaction: str | None
    severity: str | None
    verification_status: str


@dataclass(frozen=True)
class RecordPoint:
    id: str
    record_type: str
    title: str
    record_date: date | None
    verification_status: str
    has_file: bool


@dataclass(frozen=True)
class ReferenceNote:
    id: str
    kind: str
    severity: str
    text: str
    source_line: str
    reviewed_at: date


class Refs:
    """Hands out E1, E2, ... in the order items are created."""

    def __init__(self) -> None:
        self._n = 0

    def next(self) -> str:
        self._n += 1
        return f"E{self._n}"


def _verif(status: str | None) -> str:
    return VERIFICATION_LABEL.get(status or "unverified", "not verified")


def _day(d: date | None, missing: str = "not recorded") -> str:
    return d.isoformat() if d else missing


# ------------------------------------------------------------------------------------ labs
def _range_phrase(p: LabPoint) -> str:
    unit = f" {p.unit}" if p.unit else ""
    if p.ref_low is not None and p.ref_high is not None:
        return f"report range {fmt_num(p.ref_low)} to {fmt_num(p.ref_high)}{unit}"
    if p.ref_low is not None:
        return f"report range: at least {fmt_num(p.ref_low)}{unit}"
    if p.ref_high is not None:
        return f"report range: at most {fmt_num(p.ref_high)}{unit}"
    return "no report range recorded"


_FLAG_PHRASE = {
    "low": "below the report range",
    "high": "above the report range",
    "normal": "within the report range",
    "unknown": "no comparison with a range was possible",
}


def _value(p: LabPoint) -> str:
    if p.value_numeric is not None:
        return fmt_num(p.value_numeric)
    return sanitize(p.value_text, 60) or "no value"


def mentioned_tests(points: list[LabPoint], question: str) -> set[str]:
    q = norm_name(question)
    out: set[str] = set()
    for p in points:
        name = norm_name(p.test_name)
        if name and re.search(rf"(?<![\w]){re.escape(name)}(?![\w])", q):
            out.add(name)
    return out


def lab_items(
    points: list[LabPoint],
    refs: Refs,
    wanted: set[str],
    per_test: int = 8,
    max_tests: int = 10,
) -> tuple[list[EvidenceItem], list[LabPoint]]:
    """Lab evidence. With named tests: their recent history plus any change, comparability
    and conflict notes. Without: the latest result of each test. Returns the items and the
    points that were shown (the timeline builder uses those)."""
    groups: dict[str, list[LabPoint]] = {}
    for p in sorted(points, key=lambda x: (x.observed_on, x.id)):
        groups.setdefault(norm_name(p.test_name), []).append(p)

    if wanted:
        chosen = [(k, v[-per_test:]) for k, v in groups.items() if k in wanted]
    else:
        latest = sorted(groups.items(), key=lambda kv: kv[1][-1].observed_on, reverse=True)
        chosen = [(k, v[-1:]) for k, v in latest[:max_tests]]

    items: list[EvidenceItem] = []
    shown: list[LabPoint] = []
    for _key, pts in chosen:
        point_refs: list[str] = []
        for p in pts:
            ref = refs.next()
            point_refs.append(ref)
            shown.append(p)
            unit = f" {p.unit}" if p.unit else ""
            note, withheld = free_text(p.notes, 160)
            tail = f" Note on the result: {note}." if note else ""
            if withheld:
                tail = " A free-text note was withheld because it contained instruction-like text."
            items.append(
                EvidenceItem(
                    ref=ref,
                    source_type="lab_result",
                    source_record_id=p.id,
                    label=f"{p.test_name} {_value(p)}{unit} on {p.observed_on.isoformat()}",
                    text=(
                        f"Lab result: {sanitize(p.test_name, 80)} = {_value(p)}{unit}; "
                        f"observed on {p.observed_on.isoformat()}; {_range_phrase(p)}; "
                        f"{_FLAG_PHRASE.get(p.flag, _FLAG_PHRASE['unknown'])}; "
                        f"{_verif(p.verification_status)}.{tail}"
                    ),
                    recorded_at=p.observed_on,
                    verification_status=p.verification_status,
                )
            )
        if wanted:
            items.extend(_lab_notes(pts, point_refs, refs))
    return items, shown


def _lab_notes(pts: list[LabPoint], point_refs: list[str], refs: Refs) -> list[EvidenceItem]:
    out: list[EvidenceItem] = []
    name = sanitize(pts[0].test_name, 80)

    # Same test, same day, different values: show the conflict, never choose.
    by_day: dict[date, list[tuple[LabPoint, str]]] = {}
    for p, r in zip(pts, point_refs, strict=True):
        by_day.setdefault(p.observed_on, []).append((p, r))
    for day, group in sorted(by_day.items()):
        values = {_value(p) for p, _ in group}
        if len(group) > 1 and len(values) > 1:
            listed = ", ".join(f"{_value(p)} ({r})" for p, r in group)
            out.append(
                EvidenceItem(
                    ref=refs.next(),
                    source_type="derived",
                    source_record_id=None,
                    label=f"Conflicting {name} values on {day.isoformat()}",
                    text=(
                        f"Conflict: {name} has more than one different value recorded for "
                        f"{day.isoformat()}: {listed}. It is not possible to tell from the "
                        "records which one is right; the patient or the issuing lab should "
                        "clarify."
                    ),
                    recorded_at=day,
                )
            )

    if len(pts) < 2:
        return out
    units = {norm_unit(p.unit) for p in pts}
    all_numeric = all(p.value_numeric is not None for p in pts)
    if len(units) == 1 and all_numeric:
        first, last = pts[0], pts[-1]
        if first.observed_on == last.observed_on:
            return out
        delta = last.value_numeric - first.value_numeric  # type: ignore[operator]
        unit = f" {last.unit}" if last.unit else ""
        sign = "+" if delta > 0 else ""
        out.append(
            EvidenceItem(
                ref=refs.next(),
                source_type="derived",
                source_record_id=None,
                label=f"Change in {name}",
                text=(
                    f"Change (calculated by the system from {point_refs[0]} and "
                    f"{point_refs[-1]}): {name} went from {fmt_num(first.value_numeric)} to "
                    f"{fmt_num(last.value_numeric)}{unit} between {first.observed_on.isoformat()} "
                    f"and {last.observed_on.isoformat()} ({sign}{fmt_num(delta)}{unit}). "
                    f"{len(pts)} results are listed. This is an observed difference, not an "
                    "interpretation."
                ),
                recorded_at=last.observed_on,
            )
        )
    else:
        shown_units = ", ".join(sorted({p.unit or "no unit" for p in pts}))
        why = (
            f"they are recorded in different units ({shown_units})"
            if len(units) > 1
            else "at least one result has no numeric value"
        )
        out.append(
            EvidenceItem(
                ref=refs.next(),
                source_type="derived",
                source_record_id=None,
                label=f"{name} results are not comparable",
                text=(
                    f"Not comparable: the {name} results cannot be compared because {why}. No "
                    "change was calculated and no conversion was attempted. Each result is "
                    "listed separately."
                ),
                recorded_at=pts[-1].observed_on,
            )
        )
    return out


# ------------------------------------------------------------------------------ medicines
def medication_items(meds: list[MedPoint], refs: Refs, limit: int = 15) -> list[EvidenceItem]:
    out: list[EvidenceItem] = []
    for m in [m for m in meds if m.status in ("active", "paused")][:limit]:
        reason, withheld_reason = free_text(m.reason, 80)
        dose, withheld_dose = free_text(m.dose_text, 60)
        strength = f" {sanitize(m.strength, 40)}" if m.strength else ""
        form = f" ({sanitize(m.form, 24)})" if m.form else ""
        basis = (
            "linked to a prescription record"
            if m.basis == "prescribed"
            else "self-reported, not linked to a prescription"
        )
        bits = [
            f"Medicine: {sanitize(m.name, 80)}{strength}{form}",
            basis,
            f"recorded status {m.status}",
            f"start date {_day(m.start_date)}",
            f"end date {_day(m.end_date, 'none recorded')}",
        ]
        if dose:
            bits.append(f"dose as recorded by the patient: {dose}")
        if reason:
            bits.append(f"recorded reason: {reason}")
        text = "; ".join(bits) + f"; {_verif(m.verification_status)}."
        if withheld_reason or withheld_dose:
            text += " A free-text field was withheld because it contained instruction-like text."
        out.append(
            EvidenceItem(
                ref=refs.next(),
                source_type="medication",
                source_record_id=m.id,
                label=f"{sanitize(m.name, 80)}{strength}",
                text=text,
                recorded_at=m.start_date,
                verification_status=m.verification_status,
            )
        )
    return out


def dose_items(rows: list[DoseSummary], refs: Refs, limit: int = 15) -> list[EvidenceItem]:
    out: list[EvidenceItem] = []
    for r in rows[:limit]:
        last = r.last_taken_on.isoformat() if r.last_taken_on else "never in this period"
        out.append(
            EvidenceItem(
                ref=refs.next(),
                source_type="dose_log",
                source_record_id=r.medication_id,
                label=f"Dose log, {sanitize(r.medication_name, 80)}, last {r.days} days",
                text=(
                    f"Dose log for {sanitize(r.medication_name, 80)}, last {r.days} days: "
                    f"{r.taken} marked taken, {r.skipped} marked skipped, {r.unmarked_past} "
                    f"scheduled but not marked either way; last marked taken {last}. Doses "
                    "count only when the patient marked them, so this alone does not measure "
                    "how well the medicine was taken."
                ),
            )
        )
    return out


def timeline_items(
    meds: list[MedPoint], shown_labs: list[LabPoint], refs: Refs, limit: int = 6
) -> list[EvidenceItem]:
    """Where lab dates fall relative to when a medicine is recorded as started and ended.
    Wording is positional ("before", "while recorded as active", "after") and never causal."""
    out: list[EvidenceItem] = []
    tests: dict[str, list[LabPoint]] = {}
    for p in shown_labs:
        tests.setdefault(norm_name(p.test_name), []).append(p)

    for m in meds:
        if len(out) >= limit:
            break
        for pts in tests.values():
            if len(out) >= limit:
                break
            name = sanitize(pts[0].test_name, 80)
            if m.start_date is None:
                out.append(
                    EvidenceItem(
                        ref=refs.next(),
                        source_type="derived",
                        source_record_id=None,
                        label=f"{sanitize(m.name, 80)} start date missing",
                        text=(
                            f"Missing data: no start date is recorded for "
                            f"{sanitize(m.name, 80)}, so its timing cannot be compared with the "
                            f"{name} results."
                        ),
                    )
                )
                continue
            before = [p for p in pts if p.observed_on < m.start_date]
            after = [p for p in pts if m.end_date is not None and p.observed_on > m.end_date]
            during = [p for p in pts if p not in before and p not in after]
            parts = []
            for word, group in (
                ("before the recorded start", before),
                ("while recorded as active", during),
                ("after the recorded end", after),
            ):
                if group:
                    dates = ", ".join(p.observed_on.isoformat() for p in group)
                    parts.append(f"{len(group)} {word} ({dates})")
            end = f" and ended {m.end_date.isoformat()}" if m.end_date else ""
            out.append(
                EvidenceItem(
                    ref=refs.next(),
                    source_type="derived",
                    source_record_id=None,
                    label=f"{sanitize(m.name, 80)} timeline against {name}",
                    text=(
                        f"Timeline (calculated by the system): {sanitize(m.name, 80)} is "
                        f"recorded as started {m.start_date.isoformat()}{end}. {name} results: "
                        f"{'; '.join(parts)}. Dates only; this says nothing about whether the "
                        "medicine was taken or why any change happened."
                    ),
                    recorded_at=m.start_date,
                )
            )
    return out


# --------------------------------------------------------------------------- history, allergies
def condition_items(rows: list[ConditionPoint], refs: Refs, limit: int = 20) -> list[EvidenceItem]:
    return [
        EvidenceItem(
            ref=refs.next(),
            source_type="condition",
            source_record_id=c.id,
            label=f"Condition: {sanitize(c.name, 80)}",
            text=(
                f"Condition: {sanitize(c.name, 80)}; status {c.status}; onset "
                f"{_day(c.onset_date)}; {_verif(c.verification_status)}."
            ),
            recorded_at=c.onset_date,
            verification_status=c.verification_status,
        )
        for c in rows[:limit]
    ]


def allergy_items(rows: list[AllergyPoint], refs: Refs, limit: int = 20) -> list[EvidenceItem]:
    out = []
    for a in rows[:limit]:
        reaction, _ = free_text(a.reaction, 80)
        out.append(
            EvidenceItem(
                ref=refs.next(),
                source_type="allergy",
                source_record_id=a.id,
                label=f"Allergy: {sanitize(a.substance, 80)}",
                text=(
                    f"Allergy: {sanitize(a.substance, 80)}; reaction "
                    f"{reaction or 'not recorded'}; severity {a.severity or 'not recorded'}; "
                    f"{_verif(a.verification_status)}."
                ),
                verification_status=a.verification_status,
            )
        )
    return out


def record_items(rows: list[RecordPoint], refs: Refs, limit: int = 10) -> list[EvidenceItem]:
    """Metadata only. The contents of uploaded files are never read by the assistant."""
    out = []
    for r in rows[:limit]:
        title, withheld = free_text(r.title, 100)
        shown = title if title else "[title withheld]" if withheld else "untitled"
        out.append(
            EvidenceItem(
                ref=refs.next(),
                source_type="health_record",
                source_record_id=r.id,
                label=f"{r.record_type.replace('_', ' ')}: {shown}",
                text=(
                    f"Health record: {r.record_type.replace('_', ' ')} titled \"{shown}\"; dated "
                    f"{_day(r.record_date)}; {_verif(r.verification_status)}; file attached: "
                    f"{'yes' if r.has_file else 'no'}. Only these details are available to the "
                    "assistant, not the file contents."
                ),
                recorded_at=r.record_date,
                verification_status=r.verification_status,
            )
        )
    return out


def reference_items(notes: list[ReferenceNote], refs: Refs, limit: int = 6) -> list[EvidenceItem]:
    return [
        EvidenceItem(
            ref=refs.next(),
            source_type="reference",
            source_record_id=n.id,
            label=f"Reference note ({n.kind.replace('_', ' ')}): {n.source_line}",
            text=(
                f"Reference note ({n.kind.replace('_', ' ')}, severity {n.severity}): {n.text} "
                f"Source: {n.source_line}. This is a small curated dataset; the absence of a "
                "note is not evidence that something is safe."
            ),
            recorded_at=n.reviewed_at,
        )
        for n in notes[:limit]
    ]


# ------------------------------------------------------------------------------- rendering
def render_block(items: list[EvidenceItem]) -> str:
    """Evidence as delimited data. Content is HTML-escaped so it cannot close the tag."""
    chunks = []
    for it in items:
        date_attr = f' date="{it.recorded_at.isoformat()}"' if it.recorded_at else ""
        chunks.append(
            f'<evidence ref="{it.ref}" type="{it.source_type}"{date_attr}>\n'
            f"{html.escape(it.text, quote=False)}\n</evidence>"
        )
    return "\n".join(chunks)


def render_evidence_only(items: list[EvidenceItem]) -> str:
    return "\n".join(f"[{it.ref}] {it.text}" for it in items)


def numbers_in(text: str) -> set[str]:
    """Numeric tokens normalised so 7.40, 7.4 and 07.4 compare equal."""
    out = set()
    for tok in re.findall(r"\d+(?:\.\d+)?", text):
        out.add(fmt_num(Decimal(tok)))
    return out


@dataclass
class Bundle:
    items: list[EvidenceItem] = field(default_factory=list)
    categories: list[str] = field(default_factory=list)  # which kinds of data were consulted

    @property
    def refs(self) -> set[str]:
        return {i.ref for i in self.items}

    @property
    def has_patient_data(self) -> bool:
        return any(i.source_type not in ("reference",) for i in self.items)

    def has(self, *types: str) -> bool:
        return any(i.source_type in types for i in self.items)

    @property
    def text(self) -> str:
        return "\n".join(i.text for i in self.items)
