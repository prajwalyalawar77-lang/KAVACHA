from flask import current_app, g, has_request_context, request

from app.extensions import db
from app.models import AuditLog
from app.utils.security import client_ip
from app.utils.text import json_safe


def log_action(action: str, entity_type: str | None = None, entity_id=None, meta: dict | None = None, user=None):
    if user is None:
        try:
            user = getattr(g, "current_user", None)
        except RuntimeError:
            user = None
    entry = AuditLog(
        user_id=getattr(user, "id", None),
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        ip_address=client_ip() if has_request_context() else None,
        user_agent=(request.headers.get("User-Agent", "")[:250] if has_request_context() else None),
        meta_json=json_safe(meta or {}),
    )
    db.session.add(entry)
    return entry
