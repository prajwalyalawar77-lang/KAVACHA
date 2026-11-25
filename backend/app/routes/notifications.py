"""User and organisation notifications."""

from flask import Blueprint, g, request

from app.extensions import db
from app.models import Notification
from app.routes.deps import paginate
from app.utils.responses import ok, pagination_meta
from app.utils.security import auth_required

bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")


def _scope():
    user = g.current_user
    if user.organisation_id:
        return db.or_(
            Notification.user_id == user.id,
            db.and_(Notification.organisation_id == user.organisation_id,
                    Notification.user_id.is_(None)),
        )
    return Notification.user_id == user.id


@bp.get("")
@auth_required
def list_notifications():
    user = g.current_user
    stmt = db.select(Notification).where(_scope())
    if request.args.get("unread") in ("true", "1"):
        stmt = stmt.where(Notification.is_read.is_(False))
    stmt = stmt.order_by(Notification.created_at.desc())
    rows, total, page, per_page = paginate(stmt, default_per_page=25)
    unread = db.session.scalar(
        db.select(db.func.count()).select_from(Notification)
        .where(_scope(), Notification.is_read.is_(False))
    ) or 0
    return ok({
        "notifications": [row.to_dict() for row in rows],
        "unread_count": unread,
        "email_enabled": False,
        "note": "Notifications are shown in-app only; no emails are sent by this demo deployment.",
    }, meta=pagination_meta(total, page, per_page))


@bp.post("/<int:notification_id>/read")
@auth_required
def mark_read(notification_id: int):
    notification = db.session.get(Notification, notification_id)
    if not notification:
        return ok({"notification": None})
    user = g.current_user
    allowed = notification.user_id == user.id or (
        notification.user_id is None and user.organisation_id
        and notification.organisation_id == user.organisation_id
    )
    if allowed and not notification.is_read:
        notification.is_read = True
        db.session.commit()
    return ok({"notification": notification.to_dict() if allowed else None})


@bp.post("/read-all")
@auth_required
def mark_all_read():
    db.session.execute(
        db.update(Notification).where(_scope(), Notification.is_read.is_(False)).values(is_read=True)
    )
    db.session.commit()
    return ok({"message": "All notifications marked as read."})
