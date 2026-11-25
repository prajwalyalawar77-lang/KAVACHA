"""Role-aware dashboard summary."""

from flask import Blueprint, g

from app.extensions import db
from app.models import Document, FraudAlert, Notification, Organisation, RiskAssessment, User
from app.modules.industrial_intelligence.engine import industrial_dashboard
from app.routes.deps import scoped_documents
from app.utils.responses import ok
from app.utils.security import auth_required

bp = Blueprint("dashboard", __name__, url_prefix="/api/dashboard")


def _unread(user) -> int:
    conditions = [Notification.user_id == user.id, Notification.is_read.is_(False)]
    if user.organisation_id:
        org_condition = db.and_(Notification.organisation_id == user.organisation_id,
                                Notification.user_id.is_(None), Notification.is_read.is_(False))
        return db.session.scalar(
            db.select(db.func.count()).select_from(Notification).where(
                db.or_(db.and_(*conditions), org_condition))
        ) or 0
    return db.session.scalar(
        db.select(db.func.count()).select_from(Notification).where(*conditions)
    ) or 0


def _public_dashboard(user) -> dict:
    documents = db.session.scalars(
        scoped_documents(user).order_by(Document.created_at.desc()).limit(50)
    ).all()
    categories = {"low": 0, "medium": 0, "high": 0, "critical": 0, "unassessed": 0}
    for document in documents:
        if document.risk_assessment:
            categories[document.risk_assessment.category] = categories.get(document.risk_assessment.category, 0) + 1
        else:
            categories["unassessed"] += 1
    alerts = db.session.scalar(
        db.select(db.func.count()).select_from(FraudAlert)
        .join(Document, FraudAlert.document_id == Document.id)
        .where(Document.owner_id == user.id, FraudAlert.status == "open")
    ) or 0
    return {
        "role": user.role,
        "counts": {
            "documents": len(documents),
            "analysed": sum(1 for d in documents if d.status == "analysed"),
            "redacted": sum(1 for d in documents if d.redacted_path),
            "open_alerts": alerts,
        },
        "risk_distribution": categories,
        "recent_documents": [d.to_dict(include_summary=True) for d in documents[:6]],
        "unread_notifications": _unread(user),
        "retention_days": user.retention_days,
        "quick_actions": [
            {"label": "Check a document", "path": "/app/public-safety", "kind": "primary"},
            {"label": "Compare two versions", "path": "/app/compare", "kind": "secondary"},
            {"label": "View history", "path": "/app/history", "kind": "secondary"},
        ],
    }


def _admin_dashboard() -> dict:
    role_counts = dict(db.session.execute(
        db.select(User.role, db.func.count()).group_by(User.role)
    ).all())
    categories = dict(db.session.execute(
        db.select(RiskAssessment.category, db.func.count()).group_by(RiskAssessment.category)
    ).all())
    recent_documents = db.session.scalars(
        db.select(Document).where(Document.deleted_at.is_(None))
        .order_by(Document.created_at.desc()).limit(6)
    ).all()
    recent_alerts = db.session.scalars(
        db.select(FraudAlert).order_by(FraudAlert.created_at.desc()).limit(5)
    ).all()
    return {
        "role": "admin",
        "counts": {
            "users": sum(role_counts.values()),
            "organisations": db.session.scalar(db.select(db.func.count()).select_from(Organisation)) or 0,
            "documents": db.session.scalar(
                db.select(db.func.count()).select_from(Document).where(Document.deleted_at.is_(None))
            ) or 0,
            "open_alerts": db.session.scalar(
                db.select(db.func.count()).select_from(FraudAlert).where(FraudAlert.status == "open")
            ) or 0,
        },
        "users_by_role": role_counts,
        "risk_distribution": {key: categories.get(key, 0) for key in ("low", "medium", "high", "critical")},
        "recent_documents": [d.to_dict(include_summary=True) for d in recent_documents],
        "recent_alerts": [a.to_dict() for a in recent_alerts],
        "unread_notifications": _unread(g.current_user),
    }


@bp.get("")
@auth_required
def dashboard_summary():
    user = g.current_user
    if user.role == "admin":
        return ok(_admin_dashboard())
    if user.role == "industrial":
        if not user.organisation_id:
            return ok({
                "role": "industrial",
                "organisation_required": True,
                "message": "Complete your organisation profile to unlock industrial dashboards.",
                "unread_notifications": _unread(user),
            })
        data = industrial_dashboard(user.organisation_id)
        documents = db.session.scalars(
            scoped_documents(user).order_by(Document.created_at.desc()).limit(6)
        ).all()
        data.update({
            "role": "industrial",
            "organisation": user.organisation.to_dict() if user.organisation else None,
            "recent_documents": [d.to_dict(include_summary=True) for d in documents],
            "unread_notifications": _unread(user),
            "quick_actions": [
                {"label": "Upload a document", "path": "/app/upload", "kind": "primary"},
                {"label": "Supplier onboarding", "path": "/app/suppliers", "kind": "secondary"},
                {"label": "Fraud graph", "path": "/app/fraud-intelligence", "kind": "secondary"},
                {"label": "Expiry alerts", "path": "/app/industrial", "kind": "secondary"},
            ],
        })
        return ok(data)
    return ok(_public_dashboard(user))
