import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Language = Literal["en", "hi", "or"]
MAX_QUESTION_CHARS = 2000


class ContextIn(BaseModel):
    """Which kinds of record a chat may use. Omitted fields keep their current value."""

    model_config = ConfigDict(extra="forbid")
    medicines: bool | None = None
    history: bool | None = None
    labs: bool | None = None
    doses: bool | None = None
    allergies: bool | None = None


class ContextOut(BaseModel):
    medicines: bool
    history: bool
    labs: bool
    doses: bool
    allergies: bool


class SessionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str | None = Field(default=None, max_length=80)
    language: Language = "en"
    context: ContextIn = Field(default_factory=ContextIn)

    @field_validator("title")
    @classmethod
    def _title(cls, v: str | None) -> str | None:
        v = " ".join((v or "").split())
        return v or None


class AskIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    content: str = Field(min_length=1, max_length=MAX_QUESTION_CHARS)

    @field_validator("content")
    @classmethod
    def _content(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Enter a question.")
        return v


class EvidenceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    ref: str
    source_type: str
    source_record_id: uuid.UUID | None
    source_label: str
    recorded_at: date | None
    verification_status: str | None
    cited: bool


class MessageOut(BaseModel):
    id: uuid.UUID
    role: Literal["user", "assistant"]
    content: str
    safety_classification: str | None
    mode: str | None  # "open", "llm", "evidence_only", "fallback" or "canned"; assistant only
    has_image: bool = False  # the patient attached a picture (it is not stored)
    created_at: datetime
    evidence: list[EvidenceOut] = []


class SessionBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    title: str
    language: Language
    created_at: datetime
    updated_at: datetime


class SessionDetail(SessionBrief):
    context: ContextOut
    # The patient's current "AI can use my records" consent. Without it, `context` is not used.
    consent_granted: bool
    messages: list[MessageOut]


class AskOut(BaseModel):
    user_message: MessageOut
    assistant_message: MessageOut


class StatusOut(BaseModel):
    mode: Literal["llm", "evidence_only"]
    open_mode: bool = False
    image_input: bool = False
    provider: str
    model: str | None
    consent_granted: bool
    notices: list[str]
