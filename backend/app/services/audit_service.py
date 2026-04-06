import json
from typing import Any, Optional
from sqlalchemy.orm import Session
from app.models import AuditLog


def log_action(
    db: Session,
    *,
    company_id: Optional[int],
    user_id: Optional[int],
    action: str,
    entity_type: str,
    entity_id: Optional[int] = None,
    meta: Optional[dict[str, Any]] = None,
) -> None:
    row = AuditLog(
        company_id=company_id,
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        meta=json.dumps(meta) if meta else None,
    )
    db.add(row)
