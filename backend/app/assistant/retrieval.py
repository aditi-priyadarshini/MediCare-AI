"""Retrieval: turn a question and the allowed context into an evidence bundle.

The model never sees a database, credentials or SQL. This module runs a fixed set of queries,
every one scoped to the signed-in patient's id, and only for the kinds of record the chat has
switched on AND the patient has consented to ("ai_context"). It reads structured fields only:
the contents of uploaded files are never opened. Reference data (the Phase 4 curated rules) is
not patient data and is available without the consent toggle.
"""

import re
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.assistant import evidence as ev
from app.assistant.models import CONTEXT_KEYS
from app.medications.models import DoseLog, Medication, Medicine
from app.patients import service as patient_svc
from app.patients.models import PatientAllergy, PatientCondition, PatientProfile
from app.records.models import HealthRecord, LabResult
from app.safety import engine as eng
from app.safety import service as safety_svc
from app.safety.models import ActiveIngredient, MedicineIngredient

DOSE_WINDOW_DAYS = 14
MAX_LAB_ROWS = 500


@dataclass(frozen=True)
class Flags:
    medicines: bool = False
    history: bool = False
    labs: bool = False
    doses: bool = False
    allergies: bool = False

    def any(self) -> bool:
        return any(self.as_dict().values())

    def as_dict(self) -> dict[str, bool]:
        return {k: bool(getattr(self, k)) for k in CONTEXT_KEYS}

    @classmethod
    def from_dict(cls, data: dict | None) -> "Flags":
        data = data or {}
        return cls(**{k: bool(data.get(k, False)) for k in CONTEXT_KEYS})


def ai_consent_granted(db: Session, user) -> bool:
    consents = patient_svc.current_consents(db, user.id)
    return any(c.granted for c in consents if c.consent_type == "ai_context")


def effective_flags(stored: dict | None, consent: bool) -> Flags:
    """What the chat asked for, limited by what the patient currently consents to."""
    return Flags.from_dict(stored) if consent else Flags()


def _tz(db: Session, user) -> ZoneInfo:
    name = db.scalar(select(PatientProfile.timezone).where(PatientProfile.user_id == user.id))
    try:
        return ZoneInfo(name or "UTC")
    except Exception:
        return ZoneInfo("UTC")


# -------------------------------------------------------------------------------- loaders
def _labs(db: Session, user) -> list[ev.LabPoint]:
    rows = db.scalars(
        select(LabResult)
        .where(LabResult.patient_user_id == user.id, LabResult.status == "active")
        .order_by(LabResult.observed_on.desc())
        .limit(MAX_LAB_ROWS)
    )
    return [
        ev.LabPoint(
            id=str(r.id),
            test_name=r.test_name,
            value_numeric=r.value_numeric,
            value_text=r.value_text,
            unit=r.unit,
            ref_low=r.ref_low,
            ref_high=r.ref_high,
            flag=r.flag,
            observed_on=r.observed_on,
            verification_status=r.verification_status,
            notes=r.notes,
        )
        for r in rows
    ]


def _meds(db: Session, user) -> list[ev.MedPoint]:
    rows = db.scalars(
        select(Medication)
        .where(Medication.patient_user_id == user.id, Medication.status != "entered_in_error")
        .order_by(Medication.created_at)
    )
    return [
        ev.MedPoint(
            id=str(m.id),
            name=m.display_name,
            strength=m.strength_text,
            form=m.form,
            dose_text=m.dose_text,
            basis=m.basis,
            status=m.status,
            start_date=m.start_date,
            end_date=m.end_date,
            reason=m.reason,
            verification_status=m.verification_status,
        )
        for m in rows
    ]


def _dose_summaries(db: Session, user, now: datetime, tz: ZoneInfo) -> list[ev.DoseSummary]:
    since = now - timedelta(days=DOSE_WINDOW_DAYS)
    when = func.coalesce(DoseLog.scheduled_at, DoseLog.taken_at)
    rows = db.execute(
        select(DoseLog, Medication.display_name)
        .join(Medication, Medication.id == DoseLog.medication_id)
        .where(
            DoseLog.patient_user_id == user.id,
            Medication.patient_user_id == user.id,
            Medication.status != "entered_in_error",
            when >= since,
            when <= now,
        )
        .limit(5000)
    ).all()
    acc: dict[uuid.UUID, dict] = {}
    for log, name in rows:
        a = acc.setdefault(
            log.medication_id,
            {"name": name, "taken": 0, "skipped": 0, "unmarked": 0, "last": None},
        )
        if log.status == "taken":
            a["taken"] += 1
            if log.taken_at is not None:
                day = log.taken_at.astimezone(tz).date()
                a["last"] = max(a["last"], day) if a["last"] else day
        elif log.status == "skipped":
            a["skipped"] += 1
        elif log.scheduled_at is not None and log.scheduled_at < now:
            a["unmarked"] += 1
    return [
        ev.DoseSummary(
            str(mid),
            a["name"],
            DOSE_WINDOW_DAYS,
            a["taken"],
            a["skipped"],
            a["unmarked"],
            a["last"],
        )
        for mid, a in sorted(acc.items(), key=lambda kv: kv[1]["name"].casefold())
    ]


def _conditions(db: Session, user) -> list[ev.ConditionPoint]:
    rows = db.scalars(
        select(PatientCondition)
        .where(
            PatientCondition.patient_user_id == user.id,
            PatientCondition.status != "entered_in_error",
        )
        .order_by(PatientCondition.created_at)
    )
    return [
        ev.ConditionPoint(str(c.id), c.display_name, c.status, c.onset_date, c.verification_status)
        for c in rows
    ]


def _allergies(db: Session, user) -> list[ev.AllergyPoint]:
    rows = db.scalars(
        select(PatientAllergy)
        .where(PatientAllergy.patient_user_id == user.id, PatientAllergy.status == "active")
        .order_by(PatientAllergy.created_at)
    )
    return [
        ev.AllergyPoint(str(a.id), a.substance, a.reaction, a.severity, a.verification_status)
        for a in rows
    ]


def _records(db: Session, user) -> list[ev.RecordPoint]:
    rows = db.scalars(
        select(HealthRecord)
        .where(HealthRecord.patient_user_id == user.id, HealthRecord.status == "active")
        .order_by(HealthRecord.record_date.desc().nulls_last(), HealthRecord.created_at.desc())
        .limit(10)
    )
    return [
        ev.RecordPoint(
            str(r.id), r.record_type, r.title, r.record_date, r.verification_status, r.has_file
        )
        for r in rows
    ]


def _mentions(question_norm: str, name: str) -> bool:
    n = ev.norm_name(name)
    return bool(n) and re.search(rf"(?<!\w){re.escape(n)}(?!\w)", question_norm) is not None


def _reference_notes(db: Session, question: str) -> list[ev.ReferenceNote]:
    q = ev.norm_name(question)
    ingredient_rows = db.execute(select(ActiveIngredient.id, ActiveIngredient.name)).all()
    ids: set[uuid.UUID] = {i for i, n in ingredient_rows if _mentions(q, n)}
    medicine_ids = {i for i, n in db.execute(select(Medicine.id, Medicine.name)) if _mentions(q, n)}
    if medicine_ids:
        ids |= set(
            db.scalars(
                select(MedicineIngredient.ingredient_id).where(
                    MedicineIngredient.medicine_id.in_(medicine_ids)
                )
            )
        )
    if not ids:
        return []
    rules = safety_svc.load_rules(db, None, ids)
    # Drug-drug pairs are stored in sorted-id order, so the ingredient the patient mentioned
    # can be on either side of a rule: load every ingredient the rules mention.
    mentioned = {uuid.UUID(r.ingredient_id) for r in rules} | {
        uuid.UUID(r.counterpart_ingredient_id) for r in rules if r.counterpart_ingredient_id
    }
    names = safety_svc.load_ingredients(db, ids | mentioned)
    rules.sort(key=lambda r: (-eng.SEVERITY_RANK[r.severity], r.description))
    out = []
    for r in rules:
        a = names.get(r.ingredient_id)
        b = names.get(r.counterpart_ingredient_id) if r.counterpart_ingredient_id else None
        pair = " with ".join(
            x
            for x in (
                a.name if a else None,
                b.name if b else ev.sanitize(r.counterpart_term, 80),
            )
            if x
        )
        text = " ".join(
            part
            for part in (
                f"{pair}: {ev.sanitize(r.description, 400)}",
                ev.sanitize(r.clinical_significance, 300),
                ev.sanitize(r.guidance, 300),
            )
            if part
        )
        s = r.source
        source_line = (
            f"{s.name}, version {s.version}, reviewed {s.reviewed_at.isoformat()}, "
            f"{s.jurisdiction}"
        )
        out.append(
            ev.ReferenceNote(
                id=r.id,
                kind=r.kind,
                severity=r.severity,
                text=text,
                source_line=source_line,
                reviewed_at=s.reviewed_at,
            )
        )
    return out


# --------------------------------------------------------------------------------- bundle
def build_bundle(
    db: Session, user, flags: Flags, question: str, now: datetime | None = None
) -> ev.Bundle:
    now = now or datetime.now(UTC)
    refs = ev.Refs()
    items: list[ev.EvidenceItem] = []
    categories: list[str] = []
    shown_labs: list[ev.LabPoint] = []
    wanted: set[str] = set()
    tz = _tz(db, user) if (flags.doses) else ZoneInfo("UTC")

    if flags.labs:
        points = _labs(db, user)
        wanted = ev.mentioned_tests(points, question)
        lab_it, shown_labs = ev.lab_items(points, refs, wanted)
        items += lab_it
        categories.append("labs")
    if flags.medicines:
        meds = _meds(db, user)
        items += ev.medication_items(meds, refs)
        categories.append("medicines")
        if wanted and shown_labs:
            items += ev.timeline_items(meds, shown_labs, refs)
    if flags.doses:
        items += ev.dose_items(_dose_summaries(db, user, now, tz), refs)
        categories.append("doses")
    if flags.history:
        items += ev.condition_items(_conditions(db, user), refs)
        items += ev.record_items(_records(db, user), refs)
        categories.append("history")
    if flags.allergies:
        items += ev.allergy_items(_allergies(db, user), refs)
        categories.append("allergies")

    notes = _reference_notes(db, question)
    if notes:
        items += ev.reference_items(notes, refs)
        categories.append("reference")
    return ev.Bundle(items=items, categories=categories)
