"""Orchestration: policy -> retrieval -> model draft -> validation -> fixed footer -> storage.

Order matters and is part of the safety design:
1. Urgent, treatment-change and diagnosis requests are answered with fixed text before any
   record is read or any model is called.
2. Evidence is retrieved only for the kinds of record this chat switched on and the patient
   consents to. No evidence means no model call: the assistant does not answer from general
   knowledge.
3. The model sees de-identified, delimited evidence and returns a draft that is validated.
   Anything that fails validation (or any provider failure) falls back to listing the matching
   records exactly as recorded.
4. The disclaimer and the association-not-causation note are added by the server.
"""

import hashlib
import re
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.assistant import evidence as ev
from app.assistant import policy, retrieval
from app.assistant.models import (
    AiEvidenceItem,
    ChatContextAccessLog,
    ChatMessage,
    ChatSession,
)
from app.assistant.prompts import SYSTEM_PROMPT, build_repair_note, build_user_prompt
from app.assistant.provider import LLMProvider, LLMUnavailable
from app.assistant.schemas import ContextIn
from app.assistant.validate import validate_answer
from app.audit.service import record as audit
from app.core.errors import AppError

MAX_SESSIONS_PER_USER = 100
MAX_MESSAGES_PER_SESSION = 200

_CITE = re.compile(r"\[E(\d+)\]")

LISTING_INTRO = (
    "Here is what the records you have allowed, and the reference data, show. No AI model "
    "wrote this list."
)
FALLBACK_INTRO = (
    "I couldn't produce a written summary I can stand behind, so here are the matching records "
    "exactly as recorded."
)
UNAVAILABLE_INTRO = (
    "I couldn't reach the AI model just now, so here are the matching records exactly as "
    "recorded. Please try again in a moment."
)


def not_found() -> AppError:
    return AppError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.")


@dataclass
class Answer:
    text: str
    classification: str
    metadata: dict
    items: list[ev.EvidenceItem] = field(default_factory=list)
    cited: set[str] = field(default_factory=set)


def _needs_association_note(bundle: ev.Bundle, effect_question: bool) -> bool:
    if bundle.has("lab_result") and bundle.has("medication", "dose_log"):
        return True
    return effect_question and bundle.has_patient_data


def _with_footer(body: str, bundle: ev.Bundle, effect_question: bool, symptom: bool = False) -> str:
    parts = [body.strip()]
    if symptom:
        parts.append(policy.SYMPTOM_NOTE)
    if _needs_association_note(bundle, effect_question):
        parts.append(policy.ASSOCIATION_NOTE)
    parts.append(policy.FOOTER)
    return "\n\n".join(parts)


def answer_question(
    db: Session,
    user,
    *,
    question: str,
    stored_context: dict,
    consent: bool,
    language: str,
    llm: LLMProvider,
    max_tokens: int,
) -> Answer:
    verdict = policy.classify(question)
    canned = {
        policy.URGENT: (policy.EMERGENCY_TEXT, "urgent_escalation"),
        policy.TREATMENT_CHANGE: (policy.TREATMENT_TEXT, "declined_treatment"),
        policy.DIAGNOSIS: (policy.DIAGNOSIS_TEXT, "declined_diagnosis"),
    }
    if verdict.kind in canned:
        text, classification = canned[verdict.kind]
        return Answer(text, classification, {"mode": "canned"})

    flags = retrieval.effective_flags(stored_context, consent)
    bundle = retrieval.build_bundle(db, user, flags, question, symptom=verdict.symptom)

    if not bundle.items:
        if not consent:
            text = (
                policy.CONSENT_OFF_TEXT
                + " I also found nothing in the medicine reference data for that."
            )
        elif not flags.any():
            text = policy.CONTEXT_OFF_TEXT
        else:
            text = policy.NO_EVIDENCE_TEXT
        return Answer(
            _with_footer(text, bundle, False),
            "no_data",
            {"mode": "canned", "context": flags.as_dict()},
        )

    metadata: dict = {"mode": "evidence_only", "provider": llm.name, "context": flags.as_dict()}
    unavailable = False
    if llm.configured:
        prompt = build_user_prompt(
            bundle, policy.redact_question(question), language, symptom=verdict.symptom
        )
        contacted: list[str] = []
        rejected_once: tuple[str, ...] = ()
        # Up to two drafts: if the first breaks a rule the model is told which one and asked once
        # more. Both drafts go through the same validation, so this only reduces needless
        # fallbacks; it never lets an unchecked answer through.
        for attempt in (1, 2):
            note = build_repair_note(rejected_once) if attempt == 2 else ""
            try:
                result = llm.complete(
                    system=SYSTEM_PROMPT, user=prompt + note, max_tokens=max_tokens
                )
            except LLMUnavailable as exc:
                contacted += [p for p in (exc.attempted or ()) if p not in contacted]
                if attempt == 1:
                    unavailable = True
                    metadata.update(mode="fallback", rejected=["provider_unavailable"])
                # On the retry keep the first draft's rejection reasons as the outcome.
                break
            contacted += [p for p in (result.attempted or ()) if p not in contacted]
            checked = validate_answer(result.text, bundle, question)
            if checked.ok:
                body = result.text.strip()
                cited = {f"E{n}" for n in _CITE.findall(body)} & bundle.refs
                metadata.update(mode="llm", provider=result.provider, model=result.model)
                if attempt == 2:
                    metadata["attempts"] = 2
                if contacted:
                    metadata["providers_contacted"] = contacted
                return Answer(
                    _with_footer(body, bundle, verdict.effect_question, verdict.symptom),
                    "answered",
                    metadata,
                    bundle.items,
                    cited,
                )
            rejected_once = checked.reasons
            metadata.update(
                mode="fallback",
                provider=result.provider,
                model=result.model,
                rejected=list(checked.reasons),
                attempts=attempt,
            )
        if contacted:
            metadata["providers_contacted"] = contacted

    if metadata["mode"] != "fallback":
        intro = LISTING_INTRO
    else:
        intro = UNAVAILABLE_INTRO if unavailable else FALLBACK_INTRO
    body = f"{intro}\n{ev.render_evidence_only(bundle.items)}"
    return Answer(
        _with_footer(body, bundle, verdict.effect_question, verdict.symptom),
        "fallback" if metadata["mode"] == "fallback" else "evidence_only",
        metadata,
        bundle.items,
        set(bundle.refs),
    )


# --------------------------------------------------------------------------------- sessions
def owned_session_or_404(db: Session, session_id: uuid.UUID, user) -> ChatSession:
    row = db.get(ChatSession, session_id)
    if row is None or row.patient_user_id != user.id:
        raise not_found()
    return row


def merge_context(current: dict, patch: ContextIn) -> dict:
    merged = retrieval.Flags.from_dict(current).as_dict()
    for key, value in patch.model_dump(exclude_none=True).items():
        merged[key] = value
    return merged


def require_consent_to_enable(before: dict, after: dict, consent: bool) -> None:
    """Turning records ON needs the patient's consent; turning them OFF never does."""
    enabling = any(after[k] and not before.get(k, False) for k in after)
    if enabling and not consent:
        raise AppError(
            403,
            "AI_CONTEXT_CONSENT_REQUIRED",
            "Allow the assistant to use your records in My Health before switching records on.",
        )


def session_count(db: Session, user) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(ChatSession)
            .where(ChatSession.patient_user_id == user.id)
        )
        or 0
    )


def message_count(db: Session, session_id: uuid.UUID) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(ChatMessage)
            .where(ChatMessage.session_id == session_id)
        )
        or 0
    )


def evidence_for(
    db: Session, message_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[AiEvidenceItem]]:
    out: dict[uuid.UUID, list[AiEvidenceItem]] = {}
    if not message_ids:
        return out
    rows = db.scalars(
        select(AiEvidenceItem)
        .where(AiEvidenceItem.message_id.in_(message_ids))
        .order_by(AiEvidenceItem.message_id, AiEvidenceItem.ref_label)
    )
    for r in rows:
        out.setdefault(r.message_id, []).append(r)
    for rows_ in out.values():  # E2 before E10
        rows_.sort(key=lambda r: int(r.ref_label[1:]))
    return out


def persist_exchange(
    db: Session,
    request: Request,
    user,
    session: ChatSession,
    question: str,
    answer: Answer,
    provider_name: str,
) -> tuple[ChatMessage, ChatMessage, list[AiEvidenceItem]]:
    """Stores both messages, the evidence references, the access log and the audit row."""
    # Explicit timestamps: now() is fixed for a whole transaction, so both messages would tie.
    sent_at = datetime.now(UTC)
    user_msg = ChatMessage(
        session_id=session.id, role="user", content=question, model_metadata={}, created_at=sent_at
    )
    db.add(user_msg)
    db.flush()
    assistant_msg = ChatMessage(
        session_id=session.id,
        role="assistant",
        content=answer.text,
        safety_classification=answer.classification,
        model_metadata=answer.metadata,
        created_at=sent_at + timedelta(milliseconds=1),
    )
    db.add(assistant_msg)
    db.flush()

    rows = [
        AiEvidenceItem(
            message_id=assistant_msg.id,
            ref_label=i.ref,
            source_type=i.source_type,
            source_record_id=uuid.UUID(i.source_record_id) if i.source_record_id else None,
            source_label=i.label[:300],
            recorded_at=i.recorded_at,
            verification_status=i.verification_status,
            excerpt_hash=hashlib.sha256(i.text.encode()).hexdigest(),
            cited=i.ref in answer.cited,
        )
        for i in answer.items
    ]
    db.add_all(rows)

    if answer.items:
        db.add(
            ChatContextAccessLog(
                patient_user_id=user.id,
                session_id=session.id,
                message_id=assistant_msg.id,
                purpose="assistant_answer",
                context=answer.metadata.get("context", {}),
                sources=[
                    {"type": i.source_type, "id": i.source_record_id}
                    for i in answer.items
                    if i.source_record_id
                ],
                # Every vendor sent this evidence (a failover may have contacted several).
                provider=",".join(answer.metadata.get("providers_contacted") or [provider_name])[
                    :128
                ],
            )
        )

    if session.title == "New chat":
        session.title = ev.sanitize(question, 60) or "New chat"
    session.updated_at = sent_at

    # Counts and outcomes only: never the question, the answer or any record content.
    audit(
        db,
        "assistant.message",
        request,
        actor_user_id=user.id,
        resource_type="chat_session",
        resource_id=session.id,
        metadata={
            "classification": answer.classification,
            "mode": answer.metadata.get("mode"),
            "evidence_items": len(answer.items),
            "patient_items": sum(1 for i in answer.items if i.source_type != "reference"),
        },
    )
    db.commit()
    return user_msg, assistant_msg, rows
