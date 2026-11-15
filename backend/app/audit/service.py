from fastapi import Request
from sqlalchemy.orm import Session

from app.audit.models import AuditLog
from app.core.logging import request_id_ctx
from app.core.ratelimit import client_ip


def record(
    db: Session,
    action: str,
    request: Request | None = None,
    actor_user_id=None,
    resource_type: str | None = None,
    resource_id=None,
    metadata: dict | None = None,
) -> None:
    """Add an audit row to the current transaction (caller commits)."""
    db.add(
        AuditLog(
            actor_user_id=actor_user_id,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else None,
            ip=client_ip(request) if request else None,
            request_id=request_id_ctx.get(),
            event_metadata=metadata or {},
        )
    )
