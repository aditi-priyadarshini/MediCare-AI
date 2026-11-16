"""Patient-side platform feedback: send it, and see the status of what you sent."""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DbDep
from app.audit.service import record
from app.core.pagination import Page, PageDep
from app.core.ratelimit import enforce
from app.feedback.models import Feedback

router = APIRouter(prefix="/feedback", tags=["feedback"])

Category = Literal["general", "bug", "accessibility", "content", "other"]


class FeedbackIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    category: Category = "general"
    message: Annotated[str, Field(min_length=5, max_length=2000)]
    page: Annotated[str | None, Field(max_length=120)] = None

    @field_validator("message")
    @classmethod
    def _message(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 5:
            raise ValueError("Please write at least a few words.")
        return v

    @field_validator("page")
    @classmethod
    def _page(cls, v: str | None) -> str | None:
        # A page path only (e.g. "/labs"): never a URL, so no query string or fragment is kept.
        if not v:
            return None
        v = v.strip()
        if not v.startswith("/") or any(c in v for c in "?#") or v.startswith("//"):
            return None
        return v


class FeedbackOut(BaseModel):
    """What the sender sees. Moderator notes stay internal."""

    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    category: Category
    message: str
    page: str | None
    status: Literal["new", "reviewed", "actioned", "dismissed"]
    created_at: datetime


@router.post("", response_model=FeedbackOut, status_code=201)
def send_feedback(body: FeedbackIn, request: Request, user: CurrentUser, db: DbDep):
    enforce(request, "feedback", str(user.id), 10, 3600)
    row = Feedback(user_id=user.id, **body.model_dump())
    db.add(row)
    db.flush()
    # The audit row names the category only, never the message.
    record(
        db,
        "feedback.sent",
        request,
        actor_user_id=user.id,
        resource_type="feedback",
        resource_id=row.id,
        metadata={"category": row.category},
    )
    db.commit()
    return row


@router.get("", response_model=Page[FeedbackOut])
def my_feedback(user: CurrentUser, db: DbDep, params: PageDep):
    base = select(Feedback).where(Feedback.user_id == user.id)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.scalars(
        base.order_by(Feedback.created_at.desc()).limit(params.limit).offset(params.offset)
    ).all()
    return {"items": rows, "total": total, "limit": params.limit, "offset": params.offset}
