"""Assistant endpoints. Every query is scoped to the signed-in patient; another patient's chat
or message is indistinguishable from one that does not exist (404)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, File, Form, Request, UploadFile
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DbDep
from app.assistant import open_mode, retrieval
from app.assistant import service as svc
from app.assistant.models import AiEvidenceItem, ChatMessage, ChatSession
from app.assistant.schemas import (
    AskIn,
    AskOut,
    ContextIn,
    ContextOut,
    EvidenceOut,
    MessageOut,
    SessionBrief,
    SessionCreate,
    SessionDetail,
    StatusOut,
)
from app.audit.service import record
from app.core.errors import AppError
from app.core.pagination import Page, PageDep
from app.core.ratelimit import enforce

router = APIRouter(tags=["assistant"])


def _evidence_out(row: AiEvidenceItem) -> EvidenceOut:
    return EvidenceOut(
        id=row.id,
        ref=row.ref_label,
        source_type=row.source_type,
        source_record_id=row.source_record_id,
        source_label=row.source_label,
        recorded_at=row.recorded_at,
        verification_status=row.verification_status,
        cited=row.cited,
    )


def _message_out(msg: ChatMessage, evidence: list[AiEvidenceItem]) -> MessageOut:
    return MessageOut(
        id=msg.id,
        role=msg.role,  # type: ignore[arg-type]
        content=msg.content,
        safety_classification=msg.safety_classification,
        mode=(msg.model_metadata or {}).get("mode") if msg.role == "assistant" else None,
        has_image=bool((msg.model_metadata or {}).get("image")) and msg.role == "user",
        created_at=msg.created_at,
        evidence=[_evidence_out(e) for e in evidence],
    )


def _detail(db, user, row: ChatSession) -> SessionDetail:
    consent = retrieval.ai_consent_granted(db, user)
    messages = list(
        db.scalars(
            select(ChatMessage)
            .where(ChatMessage.session_id == row.id)
            .order_by(ChatMessage.created_at, ChatMessage.role)
        )
    )
    evidence = svc.evidence_for(db, [m.id for m in messages if m.role == "assistant"])
    return SessionDetail(
        id=row.id,
        title=row.title,
        language=row.language,  # type: ignore[arg-type]
        created_at=row.created_at,
        updated_at=row.updated_at,
        context=ContextOut(**retrieval.Flags.from_dict(row.context_mode).as_dict()),
        consent_granted=consent,
        messages=[_message_out(m, evidence.get(m.id, [])) for m in messages],
    )


# ----------------------------------------------------------------------------------- status
@router.get("/assistant/status", response_model=StatusOut)
def status(request: Request, user: CurrentUser, db: DbDep):
    llm = request.app.state.llm
    open_on = bool(request.app.state.settings.assistant_open_mode)
    notices = (
        ["Prototype: the AI answers any health question, using your current medicines."]
        if open_on
        else ["Answers use only the records you switch on for each chat."]
    )
    if not llm.configured:
        notices.append(
            "No AI model is connected. The assistant lists the matching records and reference "
            "notes without writing a summary."
        )
    return StatusOut(
        mode="llm" if llm.configured else "evidence_only",
        provider=",".join(m.name for m in getattr(llm, "members", [])) or llm.name,
        model=getattr(llm, "model", None) or None,
        open_mode=open_on and llm.configured,
        image_input=open_on and llm.configured,
        consent_granted=retrieval.ai_consent_granted(db, user),
        notices=notices,
    )


# ---------------------------------------------------------------------------------- sessions
@router.post("/assistant/sessions", response_model=SessionDetail, status_code=201)
def create_session(body: SessionCreate, request: Request, user: CurrentUser, db: DbDep):
    if svc.session_count(db, user) >= svc.MAX_SESSIONS_PER_USER:
        raise AppError(409, "SESSION_LIMIT", "Delete an old chat before starting a new one.")
    consent = retrieval.ai_consent_granted(db, user)
    context = svc.merge_context({}, body.context)
    svc.require_consent_to_enable({}, context, consent)
    row = ChatSession(
        patient_user_id=user.id,
        title=body.title or "New chat",
        language=body.language,
        context_mode=context,
    )
    db.add(row)
    db.flush()
    record(
        db,
        "assistant.session.created",
        request,
        actor_user_id=user.id,
        resource_type="chat_session",
        resource_id=row.id,
        metadata={"context": context},
    )
    db.commit()
    return _detail(db, user, row)


@router.get("/assistant/sessions", response_model=Page[SessionBrief])
def list_sessions(user: CurrentUser, db: DbDep, page: PageDep):
    where = ChatSession.patient_user_id == user.id
    total = db.scalar(select(func.count()).select_from(ChatSession).where(where)) or 0
    rows = db.scalars(
        select(ChatSession)
        .where(where)
        .order_by(ChatSession.updated_at.desc(), ChatSession.id)
        .limit(page.limit)
        .offset(page.offset)
    ).all()
    return Page[SessionBrief](
        items=[SessionBrief.model_validate(r) for r in rows],
        total=total,
        limit=page.limit,
        offset=page.offset,
    )


@router.get("/assistant/sessions/{session_id}", response_model=SessionDetail)
def get_session(session_id: uuid.UUID, user: CurrentUser, db: DbDep):
    return _detail(db, user, svc.owned_session_or_404(db, session_id, user))


@router.patch("/assistant/sessions/{session_id}/context", response_model=SessionDetail)
def update_context(
    session_id: uuid.UUID, body: ContextIn, request: Request, user: CurrentUser, db: DbDep
):
    row = svc.owned_session_or_404(db, session_id, user)
    before = retrieval.Flags.from_dict(row.context_mode).as_dict()
    after = svc.merge_context(row.context_mode, body)
    svc.require_consent_to_enable(before, after, retrieval.ai_consent_granted(db, user))
    row.context_mode = after
    record(
        db,
        "assistant.context.updated",
        request,
        actor_user_id=user.id,
        resource_type="chat_session",
        resource_id=row.id,
        metadata={"context": after},
    )
    db.commit()
    return _detail(db, user, row)


@router.delete("/assistant/sessions/{session_id}", status_code=204)
def delete_session(session_id: uuid.UUID, request: Request, user: CurrentUser, db: DbDep):
    """Hard delete: the chat, its messages and its evidence references. The access log keeps
    ids and counts only (no health content) so the patient can still see what was read."""
    row = svc.owned_session_or_404(db, session_id, user)
    record(
        db,
        "assistant.session.deleted",
        request,
        actor_user_id=user.id,
        resource_type="chat_session",
        resource_id=row.id,
    )
    db.delete(row)
    db.commit()


# ----------------------------------------------------------------------------------- messages
def _run_ask(
    request: Request,
    user,
    db,
    session_id: uuid.UUID,
    content: str,
    image=None,
) -> AskOut:
    settings = request.app.state.settings
    enforce(request, "assistant", str(user.id), settings.assistant_requests_per_minute, 60)
    session = svc.owned_session_or_404(db, session_id, user)
    if svc.message_count(db, session.id) >= svc.MAX_MESSAGES_PER_SESSION:
        raise AppError(409, "SESSION_FULL", "This chat is full. Start a new chat.")

    llm = request.app.state.llm
    consent = retrieval.ai_consent_granted(db, user)
    if settings.assistant_open_mode and llm.configured:
        answer = svc.answer_open(
            db,
            user,
            session=session,
            question=content,
            consent=consent,
            llm=llm,
            max_tokens=max(settings.llm_max_output_tokens, settings.open_max_output_tokens),
            image=image,
        )
    else:
        if image is not None:
            raise AppError(
                409,
                "IMAGE_NOT_AVAILABLE",
                "Picture questions need a connected AI model with open mode on.",
            )
        answer = svc.answer_question(
            db,
            user,
            question=content,
            stored_context=session.context_mode,
            consent=consent,
            language=session.language,
            llm=llm,
            max_tokens=settings.llm_max_output_tokens,
        )
    user_msg, assistant_msg, rows = svc.persist_exchange(
        db,
        request,
        user,
        session,
        content,
        answer,
        llm.name,
        user_metadata={"image": True} if image is not None else None,
    )
    return AskOut(
        user_message=_message_out(user_msg, []),
        assistant_message=_message_out(assistant_msg, rows),
    )


@router.post("/assistant/sessions/{session_id}/messages", response_model=AskOut, status_code=201)
def ask(session_id: uuid.UUID, body: AskIn, request: Request, user: CurrentUser, db: DbDep):
    return _run_ask(request, user, db, session_id, body.content)


@router.post(
    "/assistant/sessions/{session_id}/messages/image", response_model=AskOut, status_code=201
)
def ask_with_image(
    session_id: uuid.UUID,
    request: Request,
    user: CurrentUser,
    db: DbDep,
    image: Annotated[UploadFile, File()],
    content: Annotated[str, Form(max_length=2000)] = "",
):
    """A question with a picture (a photo taken now or one from the gallery). The picture goes
    straight to the model; it is not stored, OCR'd or kept in the chat."""
    settings = request.app.state.settings
    picture = open_mode.read_image(image, settings.max_image_bytes)
    if picture is None:
        raise AppError(422, "VALIDATION_ERROR", "The picture is empty.")
    text = content.strip() or svc.DEFAULT_IMAGE_QUESTION
    return _run_ask(request, user, db, session_id, text, picture)


@router.get("/assistant/messages/{message_id}/evidence", response_model=list[EvidenceOut])
def message_evidence(message_id: uuid.UUID, user: CurrentUser, db: DbDep):
    msg = db.scalar(
        select(ChatMessage)
        .join(ChatSession, ChatSession.id == ChatMessage.session_id)
        .where(ChatMessage.id == message_id, ChatSession.patient_user_id == user.id)
    )
    if msg is None:
        raise svc.not_found()
    return [_evidence_out(r) for r in svc.evidence_for(db, [msg.id]).get(msg.id, [])]
