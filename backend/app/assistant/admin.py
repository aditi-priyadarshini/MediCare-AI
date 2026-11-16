"""Admin view of the configured AI providers: which are in the chain, how they are doing, and a
one-click connectivity test. No key, key fragment or full URL is ever returned."""

import time
from datetime import UTC, datetime

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.api.deps import AdminUser, DbDep
from app.assistant.provider import FailoverProvider
from app.audit.service import record
from app.core.errors import AppError
from app.core.ratelimit import enforce

router = APIRouter(prefix="/admin/llm", tags=["admin"])


class ProviderOut(BaseModel):
    position: int
    name: str
    kind: str
    model: str
    host: str
    calls: int
    failures: int
    consecutive_failures: int
    cooling_down: bool
    last_ok_at: datetime | None
    last_error: str | None


class ProvidersOut(BaseModel):
    configured: bool
    providers: list[ProviderOut]


class TestOut(BaseModel):
    name: str
    ok: bool
    latency_ms: int
    error: str | None


def _chain(request: Request) -> FailoverProvider | None:
    llm = request.app.state.llm
    return llm if isinstance(llm, FailoverProvider) else None


@router.get("/providers", response_model=ProvidersOut)
def list_providers(request: Request, admin: AdminUser):
    chain = _chain(request)
    if chain is None:
        return ProvidersOut(configured=False, providers=[])
    return ProvidersOut(
        configured=True,
        providers=[
            ProviderOut(
                position=i + 1,
                last_ok_at=datetime.fromtimestamp(s.last_ok_at, UTC) if s.last_ok_at else None,
                **{k: v for k, v in s.__dict__.items() if k != "last_ok_at"},
            )
            for i, s in enumerate(chain.status())
        ],
    )


@router.post("/providers/{name}/test", response_model=TestOut)
def test_provider(name: str, request: Request, admin: AdminUser, db: DbDep):
    """Sends one fixed, content-free prompt ("Reply with the single word OK") to that provider.
    No patient data is involved."""
    chain = _chain(request)
    if chain is None or name not in {m.name for m in chain.members}:
        raise AppError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.")
    enforce(request, "llm_test", str(admin.id), 10, 60)
    started = time.monotonic()
    ok, error = chain.test(name)
    record(
        db,
        "admin.llm_test",
        request,
        actor_user_id=admin.id,
        resource_type="llm_provider",
        metadata={"provider": name, "ok": ok},
    )
    db.commit()
    return TestOut(
        name=name, ok=ok, latency_ms=int((time.monotonic() - started) * 1000), error=error
    )
