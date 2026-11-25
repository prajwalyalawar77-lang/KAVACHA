"""Administrator: platform stats, user management, organisations, audit trail."""

from flask import Blueprint, g, request

from app.constants import ROLES
from app.extensions import db
from app.models import AuditLog, Document, FraudAlert, Organisation, RiskAssessment, User, VerificationReport
from app.routes.deps import json_body, paginate
from app.services.audit_service import log_action
from app.utils.responses import err, ok, pagination_meta
from app.utils.security import admin_required
from app.utils.validation import clean_text, parse_int

bp = Blueprint("admin", __name__, url_prefix="/api/admin")


def _count(model, *conditions) -> int:
    stmt = db.select(db.func.count()).select_from(model)
    for condition in conditions:
        stmt = stmt.where(condition)
    return db.session.scalar(stmt) or 0


@bp.get("/overview")
@admin_required
def overview():
    role_counts = dict(db.session.execute(
        db.select(User.role, db.func.count()).group_by(User.role)
    ).all())
    category_counts = dict(db.session.execute(
        db.select(RiskAssessment.category, db.func.count()).group_by(RiskAssessment.category)
    ).all())
    avg_risk = db.session.scalar(db.select(db.func.avg(RiskAssessment.score)))
    documents = db.session.scalars(
        db.select(Document).where(Document.deleted_at.is_(None))
        .order_by(Document.created_at.desc()).limit(200)
    ).all()
    monthly = {}
    for document in documents:
        key = document.created_at.strftime("%Y-%m")
        monthly[key] = monthly.get(key, 0) + 1
    recent_audit = db.session.scalars(
        db.select(AuditLog).order_by(AuditLog.created_at.desc()).limit(10)
    ).all()
    recent_documents = documents[:5]
    return ok({
        "users": {
            "total": sum(role_counts.values()),
            "by_role": role_counts,
            "active": _count(User, User.is_active.is_(True)),
        },
        "organisations": _count(Organisation),
        "documents": {
            "total": _count(Document, Document.deleted_at.is_(None)),
            "analysed": _count(Document, Document.status == "analysed", Document.deleted_at.is_(None)),
            "processing": _count(Document, Document.status == "processing", Document.deleted_at.is_(None)),
            "failed": _count(Document, Document.status == "failed", Document.deleted_at.is_(None)),
        },
        "alerts": {
            "open": _count(FraudAlert, FraudAlert.status == "open"),
            "total": _count(FraudAlert),
        },
        "reports": _count(VerificationReport),
        "risk": {
            "average_score": round(avg_risk, 1) if avg_risk is not None else None,
            "distribution": {key: category_counts.get(key, 0) for key in ("low", "medium", "high", "critical")},
        },
        "monthly_documents": [{"month": key, "documents": value} for key, value in sorted(monthly.items())],
        "recent_audit": [log.to_dict() for log in recent_audit],
        "recent_documents": [document.to_dict(include_summary=True) for document in recent_documents],
    })


@bp.get("/users")
@admin_required
def list_users():
    stmt = db.select(User)
    query = (request.args.get("q") or "").strip()
    if query:
        stmt = stmt.where(db.or_(User.email.ilike(f"%{query}%"), User.full_name.ilike(f"%{query}%")))
    role = request.args.get("role")
    if role in ROLES:
        stmt = stmt.where(User.role == role)
    active = request.args.get("active")
    if active in ("true", "false"):
        stmt = stmt.where(User.is_active.is_(active == "true"))
    stmt = stmt.order_by(User.created_at.desc())
    rows, total, page, per_page = paginate(stmt, default_per_page=20)
    return ok({
        "users": [
            {
                **user.to_dict(),
                "document_count": user.documents.count(),
            }
            for user in rows
        ],
        "roles": list(ROLES),
    }, meta=pagination_meta(total, page, per_page))


@bp.patch("/users/<int:user_id>")
@admin_required
def update_user(user_id: int):
    user = db.session.get(User, user_id)
    if not user:
        return err("User not found.", 404, "not_found")
    payload = json_body()
    actor = g.current_user
    if user.id == actor.id:
        if payload.get("is_active") is False:
            return err("You cannot deactivate your own account.", 422, "self_action")
        if "role" in payload and payload.get("role") != actor.role:
            return err("You cannot change your own role.", 422, "self_action")

    if "role" in payload:
        role = (payload.get("role") or "").strip().lower()
        if role not in ROLES:
            return err("Unknown role.", 422, "validation_error")
        if user.role == "admin" and role != "admin":
            admin_count = _count(User, User.role == "admin", User.is_active.is_(True))
            if admin_count <= 1:
                return err("At least one active administrator must remain.", 422, "last_admin")
        user.role = role

    if "is_active" in payload:
        is_active = bool(payload.get("is_active"))
        if user.role == "admin" and not is_active:
            admin_count = _count(User, User.role == "admin", User.is_active.is_(True))
            if admin_count <= 1:
                return err("At least one active administrator must remain.", 422, "last_admin")
        user.is_active = is_active

    if "organisation_id" in payload:
        raw = payload.get("organisation_id")
        if raw in (None, ""):
            user.organisation_id = None
        else:
            org_id = parse_int(raw)
            if not org_id or not db.session.get(Organisation, org_id):
                return err("Organisation not found.", 422, "invalid_organisation")
            user.organisation_id = org_id
    if "full_name" in payload:
        name = clean_text(payload.get("full_name"), 120)
        if name:
            user.full_name = name
    if "retention_days" in payload:
        user.retention_days = parse_int(payload.get("retention_days"), user.retention_days, 1, 365)

    db.session.commit()
    log_action("admin.user_update", "user", user.id, {"fields": sorted(payload.keys())})
    db.session.commit()
    return ok({"user": user.to_dict()})


@bp.get("/organisations")
@admin_required
def list_organisations():
    rows = db.session.scalars(db.select(Organisation).order_by(Organisation.name.asc())).all()
    document_counts = dict(db.session.execute(
        db.select(Document.organisation_id, db.func.count())
        .where(Document.deleted_at.is_(None)).group_by(Document.organisation_id)
    ).all())
    return ok({
        "organisations": [
            {
                **organisation.to_dict(),
                "member_count": len([m for m in organisation.members if m.is_active]),
                "document_count": document_counts.get(organisation.id, 0),
            }
            for organisation in rows
        ],
    })


@bp.get("/audit-logs")
@admin_required
def audit_logs():
    stmt = db.select(AuditLog)
    action = (request.args.get("action") or "").strip()
    if action:
        stmt = stmt.where(AuditLog.action.ilike(f"%{action}%"))
    user_id = request.args.get("user_id", type=int)
    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)
    entity_type = (request.args.get("entity_type") or "").strip()
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    stmt = stmt.order_by(AuditLog.created_at.desc())
    rows, total, page, per_page = paginate(stmt, default_per_page=30)
    return ok({
        "logs": [log.to_dict() for log in rows],
        "note": "Audit logs record security-relevant actions. IP addresses are stored for accountability.",
    }, meta=pagination_meta(total, page, per_page))
