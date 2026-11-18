"""Turn the text of a scanned report into a *draft* for the record and lab forms.

Rules this module keeps (they follow docs/MEMORY.md and the upload workflow in docs/WORKFLOW.md):

* **Nothing is invented.** Every value returned is copied from a line of the text. A field that
  cannot be found is ``None``; it is never guessed, defaulted or inferred from other values.
* **A draft is not a record.** The result only pre-fills forms. The patient reviews and presses
  Save, and what is saved is ``patient_reported`` like any typed entry.
* **No interpretation.** A reference range is taken only when it is printed next to the value. The
  lab flag is still computed later by the server from that range (``service.compute_flag``).
* **No identifiers.** The patient's name, phone, ID and address are never extracted or returned.

The module is pure (no I/O, no framework imports) so it can be tested with plain strings.
"""

import re
from dataclasses import dataclass, field
from datetime import date, timedelta

# --------------------------------------------------------------------------------- vocabulary
KNOWN_TESTS = (
    "hemoglobin", "haemoglobin", "hb", "hba1c", "hgb", "rbc", "wbc", "platelet", "hematocrit",
    "haematocrit", "hct", "pcv", "mcv", "mch", "mchc", "rdw", "esr", "neutrophil", "lymphocyte",
    "monocyte", "eosinophil", "basophil", "glucose", "sugar", "fasting", "postprandial", "ppbs",
    "fbs", "rbs", "cholesterol", "triglyceride", "hdl", "ldl", "vldl", "creatinine", "urea", "bun",
    "uric acid", "sodium", "potassium", "chloride", "calcium", "phosphorus", "magnesium",
    "bilirubin", "sgot", "sgpt", "ast", "alt", "alp", "ggt", "albumin", "globulin", "protein",
    "tsh", "t3", "t4", "ft3", "ft4", "vitamin", "ferritin", "iron", "tibc", "crp", "egfr",
    "psa", "hiv", "hbsag", "hcv", "vdrl", "troponin", "inr", "pt", "aptt", "ketone",
    "urobilinogen", "pus cells", "epithelial", "specific gravity", "ph",
)  # fmt: skip

# Words that start a header, footer or demographic line, never a test name.
_NOT_A_TEST = re.compile(
    r"^(page|age|sex|gender|phone|mobile|tel|fax|email|e-mail|date|time|patient|name|dob|"
    r"sample|specimen|collected|collection|received|reported|registered|registration|printed|"
    r"ref(?:erence)?|referred|dr|doctor|consultant|lab|laboratory|barcode|bill|invoice|id|uhid|"
    r"mr|mrs|ms|no|number|address|result|results|test|tests|investigation|method|remarks?|note|"
    r"notes|comment|comments|interpretation|report|status|signature|authori[sz]ed|pathologist|"
    r"technician|total\s+amount|amount|price|rate|gst|www|http)\b",
    re.IGNORECASE,
)

_TEXT_RESULTS = {
    "negative": "Negative", "positive": "Positive", "nil": "Nil", "absent": "Absent",
    "present": "Present", "trace": "Trace", "reactive": "Reactive",
    "non-reactive": "Non-reactive", "non reactive": "Non-reactive", "nonreactive": "Non-reactive",
    "normal": "Normal", "clear": "Clear", "pale yellow": "Pale yellow", "yellow": "Yellow",
}  # fmt: skip

_UNITS = {
    "%",
    "/cu.mm",
    "/cumm",
    "/hpf",
    "/lpf",
    "/mm3",
    "/ul",
    "/µl",
    "10^3/ul",
    "10^3/µl",
    "10^6/ul",
    "10^6/µl",
    "cells/ul",
    "cells/µl",
    "fl",
    "g/dl",
    "g/l",
    "iu/l",
    "iu/ml",
    "kpa",
    "lakh/cumm",
    "lakhs/cumm",
    "mcg/dl",
    "meq/l",
    "mg/dl",
    "mg/g",
    "mg/l",
    "mg/mmol",
    "mill/cumm",
    "million/cumm",
    "millions/cumm",
    "miu/l",
    "ml/min",
    "ml/min/1.73m2",
    "mm/1hr",
    "mm/h",
    "mm/hr",
    "mmhg",
    "mmol/l",
    "mosm/kg",
    "ng/dl",
    "ng/ml",
    "nmol/l",
    "pg",
    "pg/ml",
    "pmol/l",
    "ratio",
    "sec",
    "seconds",
    "secs",
    "thou/mm3",
    "thou/ul",
    "u/l",
    "ug/dl",
    "ug/l",
    "uiu/ml",
    "umol/l",
    "x10^3/µl",
    "x10^6/µl",
    "µg/dl",
    "µg/l",
    "µiu/ml",
    "µmol/l",
}

_NUM = r"\d[\d,]*(?:\.\d+)?"
_NUM_RE = re.compile(_NUM)
_VALUE_AT = re.compile(rf"(?:(?<=\s)|^)(?P<cmp>[<>]=?)?\s?(?P<num>{_NUM})(?=\s|$|[A-Za-z%/(µµ])")
_RANGE_DASH = re.compile(rf"(?P<lo>{_NUM})\s*(?:-|–|—|to)\s*(?P<hi>{_NUM})", re.IGNORECASE)
_RANGE_UPPER = re.compile(
    rf"(?:<=?|≤|up\s*to|upto|less\s+than|below|not\s+more\s+than)\s*(?P<hi>{_NUM})", re.IGNORECASE
)
_RANGE_LOWER = re.compile(
    rf"(?:>=?|≥|more\s+than|above|greater\s+than|not\s+less\s+than)\s*(?P<lo>{_NUM})",
    re.IGNORECASE,
)
_PANEL_TITLES = re.compile(
    r"(complete\s+blood\s+count|cbc|haemogram|hemogram|lipid\s+profile|"
    r"liver\s+function(?:\s+test)?s?|kidney\s+function(?:\s+test)?s?|"
    r"renal\s+function(?:\s+test)?s?|thyroid\s+(?:profile|function)|"
    r"hba1c|glycosylated\s+h[ae]moglobin|blood\s+sugar|blood\s+glucose|"
    r"urine\s+(?:routine|analysis|examination)|"
    r"electrolytes?|vitamin\s+(?:d|b12)|iron\s+studies|coagulation\s+profile|"
    r"x-?ray|ultrasound|ultrasonography|mri|ct\s+scan|ecg|echo(?:cardiogram)?)",
    re.IGNORECASE,
)
_ORG_LINE = re.compile(
    r"\b(laborator(?:y|ies)|labs?|diagnostics?|pathology|path\s*lab|hospital|clinic|"
    r"medical\s+cent(?:er|re)|health\s*care|nursing\s+home|imaging|scan\s+cent(?:er|re))\b",
    re.IGNORECASE,
)
_MONTHS = {
    m: i + 1
    for i, m in enumerate(
        ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    )
}
_D_NUMERIC = re.compile(r"\b(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{4}|\d{2})\b")
_D_ISO = re.compile(r"\b(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})\b")
_D_NAMED = re.compile(
    r"\b(\d{1,2})(?:st|nd|rd|th)?[\s\-/,]+([A-Za-z]{3,9})[\s\-/,]+(\d{4}|\d{2})\b"
)


# ------------------------------------------------------------------------------------ results
@dataclass(frozen=True)
class LabRowDraft:
    test_name: str
    result: str  # exactly as it should appear in the form: a number as text, or words
    unit: str | None
    ref_low: float | None
    ref_high: float | None
    confidence: str  # "high" (unit and range), "medium" (one of them or a known test), "low"
    source_line: str  # the line it was read from, so the patient can check it against the report


@dataclass
class RecordDraft:
    record_type: str | None = None
    title: str | None = None
    record_date: date | None = None
    date_ambiguous: bool = False  # day and month could be swapped; dd/mm was assumed
    provider_name: str | None = None


@dataclass
class ParseResult:
    record: RecordDraft = field(default_factory=RecordDraft)
    labs: list[LabRowDraft] = field(default_factory=list)


# ------------------------------------------------------------------------------------ helpers
def _fix_ocr(text: str) -> str:
    """Light, safe normalisation. It never changes a digit."""
    text = text.replace("\u00a0", " ").replace("\t", "  ")
    text = text.replace("\u03bc", "\u00b5")  # Greek mu -> micro sign (OCR and keyboards differ)
    text = re.sub(r"[|¦]+", " ", text)  # table borders read as vertical bars
    text = re.sub(r"[ ]{2,}", "  ", text)
    return text


def _lines(text: str) -> list[str]:
    return [ln.strip() for ln in _fix_ocr(text).splitlines() if ln.strip()]


def _to_float(raw: str) -> float | None:
    try:
        return float(raw.replace(",", ""))
    except ValueError:
        return None


def _is_unit(tok: str) -> bool:
    t = tok.strip(".,;()[]").lower()
    return bool(t) and (t in _UNITS or t.rstrip(".") in _UNITS)


def _clean_name(raw: str) -> str:
    name = re.sub(r"[\s:.\-–—,;_]+$", "", raw.strip())
    name = re.sub(r"(?i)\bhba[l1i]c\b", "HbA1c", name)  # OCR reads the 1 in HbA1c as l or I
    # leading bullets or row numbers
    name = re.sub(r"^[\s:.\-–—,;*•·0-9]+(?=[A-Za-z])", "", name)
    return " ".join(name.split())


def _is_known(name: str) -> bool:
    n = name.lower()
    return any(re.search(rf"(?<![a-z]){re.escape(k)}(?![a-z])", n) for k in KNOWN_TESTS)


def _parse_tail(rest: str) -> tuple[str | None, float | None, float | None]:
    """Unit and reference range from what follows the value on the same line."""
    rest = rest.strip()
    low = high = None
    span = None
    if m := _RANGE_DASH.search(rest):
        lo, hi = _to_float(m["lo"]), _to_float(m["hi"])
        if lo is not None and hi is not None and lo <= hi:
            low, high, span = lo, hi, m.span()
    if span is None and (m := _RANGE_UPPER.search(rest)):
        high, span = _to_float(m["hi"]), m.span()
    if span is None and (m := _RANGE_LOWER.search(rest)):
        low, span = _to_float(m["lo"]), m.span()
    outside = rest if span is None else (rest[: span[0]] + " " + rest[span[1] :])
    unit = None
    for tok in outside.replace("(", " ").replace(")", " ").split():
        if _is_unit(tok):
            unit = tok.strip(".,;[]")
            break
    return unit, low, high


_FLAG_TOKEN = re.compile(r"^(?:h|l|hh|ll|high|low|\*+|h\*|l\*|ref\.?|range|normal)$", re.IGNORECASE)


def _tail_starts_like_a_result(rest: str) -> bool:
    """What follows a value must begin with a unit, a range or a flag. A word means the number
    was part of the test name ("Vitamin D, 25 Hydroxy ..."), so the match is the wrong one."""
    for tok in rest.replace("(", " ( ").split():
        if tok in {"(", ":"} or _FLAG_TOKEN.match(tok.strip(":")):
            continue
        t = tok.strip(".,;()[]")
        return (
            _is_unit(tok)
            or bool(re.match(r"^(?:[<>]=?|≤|≥|\d)", t))
            or bool(re.match(r"^(?:up|upto|less|below|above|more|greater|not)$", t, re.IGNORECASE))
        )
    return True  # nothing follows: decided by the caller


def parse_lab_line(line: str) -> LabRowDraft | None:
    """One report line -> one lab row, or ``None`` when it does not look like a result."""
    line = " ".join(_fix_ocr(line).split())
    if len(line) < 4 or len(line) > 160 or _NOT_A_TEST.match(line):
        return None
    if not re.match(r"^[^A-Za-z]{0,3}[A-Za-z]", line):
        return None

    # Text results first ("HIV 1 & 2   Non-reactive").
    low_line = line.lower()
    for key, shown in sorted(_TEXT_RESULTS.items(), key=lambda kv: -len(kv[0])):  # longest first
        m = re.search(rf"(?<![a-z\-])({re.escape(key)})(?![a-z])", low_line)
        if m:
            name = _clean_name(line[: m.start()])
            if len(re.findall(r"[A-Za-z]", name)) >= 2 and not _NOT_A_TEST.match(name):
                if _is_known(name):
                    return LabRowDraft(name, shown, None, None, None, "medium", line)
            break

    candidates = list(_VALUE_AT.finditer(line))
    chosen = None
    for m in candidates:
        name = _clean_name(line[: m.start()])
        if len(re.findall(r"[A-Za-z]", name)) < 2 or _NOT_A_TEST.match(name):
            continue
        if name.endswith("/") or re.search(r"\bof$", name, re.IGNORECASE):
            continue
        tail = line[m.end() :]
        if not _tail_starts_like_a_result(tail):
            continue
        unit, low, high = _parse_tail(tail)
        if unit or low is not None or high is not None:
            chosen = (m, name, unit, low, high)
            break
    if chosen is None and len(candidates) == 1:
        m = candidates[0]
        name = _clean_name(line[: m.start()])
        if (
            len(re.findall(r"[A-Za-z]", name)) >= 2
            and not _NOT_A_TEST.match(name)
            and _is_known(name)
        ):
            chosen = (m, name, None, None, None)
    if chosen is None:
        return None

    m, name, unit, low, high = chosen
    value = _to_float(m["num"])
    if value is None or len(name) > 120:
        return None
    shown = f"{m['cmp'] or ''}{m['num'].replace(',', '')}"
    # "< 0.5" is a limit, not a measurement. The "<" stays in the text so the form stores it as
    # words (the form only stores plain numbers as numbers), never as the number 0.5.
    known = _is_known(name)
    if unit and (low is not None or high is not None):
        confidence = "high"
    elif unit or low is not None or high is not None or known:
        confidence = "medium"
    else:
        confidence = "low"
    return LabRowDraft(name, shown, unit, low, high, confidence, line)


def parse_lab_rows(text: str, limit: int = 60) -> list[LabRowDraft]:
    seen: set[tuple[str, str]] = set()
    rows: list[LabRowDraft] = []
    for ln in _lines(text):
        row = parse_lab_line(ln)
        if row is None:
            continue
        key = (row.test_name.casefold(), row.result)
        if key in seen:  # the same row repeated on every page of a long report
            continue
        seen.add(key)
        rows.append(row)
        if len(rows) >= limit:
            break
    return rows


# --------------------------------------------------------------------------------------- dates
def _year(y: str) -> int:
    n = int(y)
    return n + 2000 if n < 100 else n


def _valid(y: int, m: int, d: int, today: date) -> date | None:
    try:
        out = date(y, m, d)
    except ValueError:
        return None
    # The bound the API enforces: at most a day ahead (patients ahead of UTC), not before 1900.
    return out if out.year >= 1900 and out <= today + timedelta(days=1) else None


def _dates_in(line: str, today: date) -> list[tuple[date, bool]]:
    """(date, ambiguous) for every date on a line. Day-first, as Indian reports print them."""
    found: list[tuple[date, bool]] = []
    for m in _D_ISO.finditer(line):
        if d := _valid(int(m[1]), int(m[2]), int(m[3]), today):
            found.append((d, False))
    for m in _D_NAMED.finditer(line):
        mon = _MONTHS.get(m[2][:3].lower())
        if mon and (d := _valid(_year(m[3]), mon, int(m[1]), today)):
            found.append((d, False))
    for m in _D_NUMERIC.finditer(line):
        a, b = int(m[1]), int(m[2])
        d = _valid(_year(m[3]), b, a, today)  # day / month / year
        if d:
            found.append((d, a <= 12 and b <= 12 and a != b))
        elif swapped := _valid(_year(m[3]), a, b, today):  # only month-first makes a real date
            found.append((swapped, False))
    return found


_DATE_PRIORITY = (
    (re.compile(r"collect|sample|specimen", re.IGNORECASE), 0),  # when the test was actually done
    (re.compile(r"test\s+date|date\s+of\s+test", re.IGNORECASE), 1),
    (re.compile(r"report|registered|received|\bdate\b", re.IGNORECASE), 2),
)


def _label_rank(line: str) -> int | None:
    for pattern, rank in _DATE_PRIORITY:
        if pattern.search(line):
            return rank
    return None


def find_date(text: str, today: date | None = None) -> tuple[date | None, bool]:
    """The date the test was done. A date beside a collection label wins over a report label, which
    wins over an unlabelled date (then the most recent on the page). Never today by default."""
    today = today or date.today()
    labelled: list[tuple[int, int, date, bool]] = []  # (rank, order, date, ambiguous)
    other: list[tuple[date, bool]] = []
    for order, ln in enumerate(_lines(text)):
        if re.search(r"\b(dob|d\.o\.b|birth|age)\b", ln, re.IGNORECASE):
            continue  # a date of birth is not the date of the report
        found = _dates_in(ln, today)
        if not found:
            continue
        rank = _label_rank(ln)
        if rank is None:
            other.extend(found)
        else:
            labelled.extend((rank, order, d, amb) for d, amb in found)
    if labelled:
        _, _, when, ambiguous = min(labelled, key=lambda t: (t[0], t[1]))
        return when, ambiguous
    if other:
        when, ambiguous = max(other, key=lambda p: p[0])
        return when, ambiguous
    return None, False


# ----------------------------------------------------------------------------- record metadata
def _guess_type(text: str, lab_rows: int) -> str | None:
    t = text.lower()
    if re.search(r"discharge\s+summary|date\s+of\s+discharge", t):
        return "discharge_summary"
    if re.search(r"vaccin|immuni[sz]ation|\bdose\s+[12]\b.*\bbatch\b", t):
        return "vaccination"
    if re.search(r"\bx-?ray\b|ultraso|sonograph|\bmri\b|\bct\s+scan\b|radiolog|impression\s*:", t):
        return "imaging"
    if lab_rows >= 2 or re.search(
        r"haematolog|hematolog|biochem|pathology|reference\s+(?:range|interval|value)|"
        r"lab(?:oratory)?\s+report",
        t,
    ):
        return "lab_report"
    if re.search(r"\brx\b|prescription|\btab\.?\s|\bcap\.?\s|\bsyp\.?\s|sig\s*:", t):
        return "prescription"
    return None


def _title(lines: list[str]) -> str | None:
    for ln in lines[:25]:
        if m := _PANEL_TITLES.search(ln):
            words = " ".join(m.group(0).split())
            return words[:1].upper() + words[1:] if words.islower() else words
    return None


def _provider(lines: list[str]) -> str | None:
    for ln in lines[:12]:
        clean = " ".join(re.sub(r"[^\w&.,'()\- ]", " ", ln).split())
        if (
            _ORG_LINE.search(clean)
            and 4 <= len(clean) <= 80
            and not re.search(r"\d{5,}|@|www|http", clean, re.IGNORECASE)
            and not _NOT_A_TEST.match(clean)
        ):
            return clean
    return None


def parse_report(text: str, today: date | None = None) -> ParseResult:
    today = today or date.today()
    lines = _lines(text)
    labs = parse_lab_rows(text)
    when, ambiguous = find_date(text, today)
    rtype = _guess_type(text, len(labs))
    return ParseResult(
        record=RecordDraft(
            record_type=rtype,
            title=_title(lines),
            record_date=when,
            date_ambiguous=ambiguous,
            provider_name=_provider(lines),
        ),
        labs=labs,
    )
