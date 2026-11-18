"""Safety policy that runs BEFORE any record is retrieved or any model is called.

Pure and deterministic: no database, no I/O. The model is never the only control:
- urgent symptoms get fixed emergency guidance and nothing else (docs/SECURITY.md section 7);
- requests to start/stop/change a medicine, or to be diagnosed, get a fixed refusal that
  points to a clinician. No patient data is retrieved and no model is called for them;
- the fixed footer is appended by the server, not written by the model.

The pattern lists are deliberately cautious: a false positive costs the patient one redirect
to a professional, a false negative could cost much more.
"""

import re
from dataclasses import dataclass

URGENT = "urgent"
TREATMENT_CHANGE = "treatment_change"
DIAGNOSIS = "diagnosis"
ANSWERABLE = "answerable"

_URGENT = [
    r"\bchest (pain|tightness|pressure)\b",
    r"\b(can'?t|cannot|can not|unable to) breathe\b",
    r"\b(difficulty|trouble|struggling) (in |with )?breathing\b",
    r"\bshort(ness)? of breath\b",
    r"\bsevere(ly)? bleeding\b",
    r"\bbleeding (heavily|a lot|badly|and won'?t stop|that won'?t stop)\b",
    r"\b(coughing|vomiting|throwing up) (up )?blood\b",
    r"\b(unconscious|unresponsive|passed out|fainted|collapsed)\b",
    r"\b(face (is )?droop\w*|slurred speech|sudden (weakness|numbness))\b",
    r"\b(seizure|seizures|convulsion|convulsions)\b",
    r"\b(suicid\w*|kill myself|end my life|want to die|self[- ]harm|hurt myself|harm myself)\b",
    r"\b(overdos\w*|took too many|taken too many|swallowed too many|poisoned|poisoning)\b",
    r"\b(anaphyla\w*|throat (is )?(closing|swelling)|swollen (tongue|throat))\b",
    r"\b(heart attack|having a stroke)\b",
    # Headache red flags (more important with recorded high blood pressure).
    r"\b(worst|thunderclap) headache\b",
    r"\b(sudden|severe|terrible|excruciating)( and \w+)? headache\b",
    r"\bheadache (with|and) (a )?(fever|stiff neck|vomiting|confusion|weakness|numbness|"
    r"(blurred|double|lost) vision)\b",
    r"\bstiff neck\b",
]

_TREATMENT = [
    r"\b(should|can|could|may|shall|do|must) i (now )?(stop|skip|quit|discontinue|double|halve)\b",
    r"\b(should|can|could|may|shall|do|must) i (now )?(increase|decrease|reduce|raise|lower|change|"
    r"switch|adjust|start|begin|restart) (taking |my |the |this |that |a |an |some )",
    r"\b(should|can|could|may|shall|do) i take (more|less|extra|double|half|another)\b",
    r"\b(stop|quit|discontinue|skip) (taking|my|the) "
    r"(medic\w*|tablets?|pills?|capsules?|dose|doses|insulin|metformin)\b",
    r"\b(increase|decrease|double|halve|reduce|raise|lower|adjust|change) (my|the|his|her) "
    r"(dose|dosage|medic\w*|tablets?|pills?)\b",
    r"\bwhat (dose|dosage) (should|do|can) i\b",
    r"\bhow (much|many) (\w+ ){0,4}should i take\b",
    r"\b(prescribe|recommend|suggest) (me )?(a |an |some |any )?(medic\w*|drugs?|tablets?|"
    r"antibiotics?|painkillers?)\b",
    r"\bwhich (medic\w*|drug|tablet|antibiotic) should i (take|use|buy|start)\b",
]

_DIAGNOSIS = [
    r"\bdo i have\b",
    r"\bam i (diabetic|anaemic|anemic|sick|ill|having|suffering)\b",
    r"\bwhat (disease|condition|illness|disorder) do i have\b",
    r"\bwhat('?s| is) wrong with me\b",
    r"\bdiagnos(e|is) (me|my)\b",
    r"\b(tell|help) me (to )?diagnose\b",
    r"\bis (it|this|that) (cancer|diabetes|a tumou?r|serious)\b",
]
# "Do I have any allergies recorded?" is a question about the record, not a diagnosis request.
_RECORD_WORDS = re.compile(
    r"\b(recorded|record|records|listed|on file|saved|logged|in my (profile|list|health))\b"
)

_EFFECT = re.compile(
    r"\b(work|works|working|effective|effect|effects|improv\w*|help|helps|helping|better|worse|"
    r"caus\w*|because of|due to|responsible)\b"
)

# A patient describing how they feel ("my head hurts", "I have a headache") is not asking a
# question about their records. Such a message gets a short, cited answer about what the records
# hold that is relevant, plus the fixed note below; it is never treated as an assessment.
_BODY_PART = (
    r"(head|stomach|tummy|belly|back|chest|throat|ear|ears|tooth|teeth|eye|eyes|leg|legs|arm|arms|"
    r"knee|knees|neck|joint|joints|muscle|muscles|foot|feet|hand|hands|skin)"
)
_SYMPTOM_WORD = (
    r"(headache|migraine|fever|cough|cold|nausea|nauseous|dizz\w+|rash|pain|painful|sore|ache|aches|"
    r"diarrh\w+|vomit\w*|tired|fatigue\w*|weak|weakness|itch\w*|swelling|swollen|cramp\w*|"
    r"constipat\w*|heartburn|palpitation\w*|sick|unwell|bloated|lightheaded)"
)
_SYMPTOM = [
    rf"\bmy {_BODY_PART} (hurts?|aches?|is (paining|sore|killing me|throbbing|pounding)|"
    rf"are (paining|sore)|feels?)\b",
    rf"\bi (have|got|am having|am getting|keep getting|feel|am feeling|'ve got|have been having) "
    rf"(a |an |some |very |so |really |been )*{_SYMPTOM_WORD}\b",
    r"\bi'?m (feeling )?(dizzy|nauseous|sick|unwell|lightheaded|tired|weak)\b",
    rf"\b(my )?{_SYMPTOM_WORD} (since|for the (last|past)|started|came on)\b",
]
_SYMPTOM_RE = [re.compile(p) for p in _SYMPTOM]

_URGENT_RE = [re.compile(p) for p in _URGENT]
_TREATMENT_RE = [re.compile(p) for p in _TREATMENT]
_DIAGNOSIS_RE = [re.compile(p) for p in _DIAGNOSIS]


def normalize(text: str) -> str:
    t = text.lower().replace("\u2019", "'").replace("\u2018", "'")
    return re.sub(r"\s+", " ", t).strip()


@dataclass(frozen=True)
class Classification:
    kind: str
    effect_question: bool = False
    symptom: bool = False  # the patient described how they feel (only set for ANSWERABLE)


def classify(question: str) -> Classification:
    q = normalize(question)
    if any(p.search(q) for p in _URGENT_RE):
        return Classification(URGENT)
    if any(p.search(q) for p in _TREATMENT_RE):
        return Classification(TREATMENT_CHANGE)
    if any(p.search(q) for p in _DIAGNOSIS_RE) and not _RECORD_WORDS.search(q):
        return Classification(DIAGNOSIS)
    return Classification(
        ANSWERABLE,
        effect_question=bool(_EFFECT.search(q)),
        symptom=any(p.search(q) for p in _SYMPTOM_RE),
    )


# ------------------------------------------------------------------------------- fixed text
EMERGENCY_TEXT = (
    "This could be an emergency. If you or someone near you has these symptoms right now, "
    "call your local emergency number immediately (112 in India) or go to the nearest "
    "emergency department. Please do not wait for an answer here. If you are thinking about "
    "harming yourself, you can call Tele-MANAS on 14416 (India) or your local crisis line, "
    "and tell someone close to you. I can't assess symptoms or give medical advice in an "
    "emergency."
)

TREATMENT_TEXT = (
    "I can't tell you whether to start, stop, skip or change a medicine or its dose. That "
    "decision belongs with your prescriber or pharmacist, who know your full history. Please "
    "don't change anything because of an app. What I can do is show what your own records say "
    'about the medicine (switch on "My current medicines" above) or help you list questions to '
    "take to your prescriber."
)

DIAGNOSIS_TEXT = (
    "I can't diagnose conditions or say what is wrong. A clinician needs to examine you and "
    "look at the full picture. I can show what is in your own records, such as recorded "
    "conditions and test results with their dates and units, so you can discuss them with "
    "your doctor."
)

CONTEXT_OFF_TEXT = (
    "Your health records are switched off for this chat, and I found nothing in the medicine "
    "reference data for that question. Switch on the records you are happy for me to use "
    "(above), or ask a pharmacist."
)

NO_EVIDENCE_TEXT = (
    "I couldn't find anything in the records you have allowed, or in the reference data, that "
    "answers this. That may simply mean it has not been recorded; it does not mean it does not "
    "exist. I don't answer from general knowledge without a source."
)

CONSENT_OFF_TEXT = (
    'The "AI uses my records" permission is switched off in My Health, so I can\'t use your '
    "records. I can still look at general medicine reference data."
)

FOOTER = (
    "This is information from your recorded data, not medical advice. It can't diagnose "
    "anything or tell you what to take. Please talk to your clinician or pharmacist before "
    "changing any treatment."
)

SYMPTOM_NOTE = (
    "I can't assess symptoms. If this is sudden, severe, getting worse, or comes with chest pain, "
    "trouble breathing, confusion, weakness, fainting, a stiff neck, vision changes or a high "
    "fever, get medical help now (112 in India). Otherwise, a pharmacist or your clinician can "
    "help you work out what to do."
)

ASSOCIATION_NOTE = (
    "Records that sit side by side in time show an association only. They do not show that a "
    "medicine caused a change; adherence, diet, illness, other medicines and dose changes can "
    "all matter. Please review the trend with your clinician."
)

# ---------------------------------------------------------------------------- redaction
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(\.[\w-]+)+")
_LONG_NUMBER = re.compile(r"(?<![\d.])\+?\d[\d\s()-]{7,}\d(?![\d.])")
_ISO_DATES = re.compile(r"(\d{4}-\d{2}-\d{2}[\s,]*)+")


def _mask_number(match: re.Match) -> str:
    text = match.group(0)
    if len(re.sub(r"\D", "", text)) < 9 or _ISO_DATES.fullmatch(text.strip() + " "):
        return text  # a short number or a list of dates, not a phone or ID number
    return "[number removed]"


def redact_question(text: str) -> str:
    """Remove obvious direct identifiers (emails, phone and ID numbers) before the question
    leaves the system. Dates and lab values are kept: they are what the question is about."""
    return _LONG_NUMBER.sub(_mask_number, _EMAIL.sub("[email removed]", text))
