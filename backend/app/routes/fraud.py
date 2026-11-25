"""Fraud intelligence: alerts, overview, relationship graph, rescan."""

from flask import Blueprint, g, request

from app.constants import ALERT_ACK, ALERT_DISMISSED, ALERT_OPEN
from app.extensions import db
from app.models import Document, FraudAlert, Organisation
from app.modules.fraud_intelligence.engine import build_graph, fraud_overview, rescan_organisation
from app.routes.deps import json_body, paginate
from app.services.audit_service import log_action
from app.services.document_service import DocumentError
from app.utils.responses import err, ok, pagination_meta
from app.utils.security import auth_required

bp = Blueprint("fraud", __name__, url_prefix="/api/fraud")

ALERT_STATUSES = {ALERT_OPEN, ALERT_ACK, ALERT_DISMISSED}


def _context():
    user = g.current_user
    if user.role == "admin":
        org_id = request.args.get("organisation_id", type=int)
        if not org_id:
            org_id = db.session.scalar(db.select(db.func.min(Organisation.id)))
        return org_id, None
    if user.role == "industrial":
        if not user.organisation_id:
            raise DocumentError("Complete your organisation profile before using fraud intelligence.", 422)
        return user.organisation_id, None
    return None, user.id


@bp.get("/overview")
@auth_required
def overview():
    org_id, owner_id = _context()
    data = fraud_overview(org_id, owner_id)
    data["scope"] = {"organisation_id": org_id, "scope": "organisation" if org_id else "personal"}
    return ok(data)


@bp.get("/graph")
@auth_required
def graph():
    user = g.current_user
    if user.role == "public":
        return err("Relationship graphs are available to organisation accounts.", 403, "forbidden")
    org_id, _ = _context()
    limit = min(60, max(5, request.args.get("limit", type=int) or 30))
    data = build_graph(org_id, limit_docs=limit)
    data["scope"] = {"organisation_id": org_id,
                     "scope": "organisation" if org_id else "all organisations (admin)"}
    data["note"] = (
        "Nodes and links are derived from submitted documents and supplier records. "
        "Connections highlight shared identifiers and are not evidence of fraud."
    )
    return ok(data)


@bp.get("/alerts")
@auth_required
def list_alerts():
    user = g.current_user
    stmt = db.select(FraudAlert)
    if user.role == "admin":
        org_id = request.args.get("organisation_id", type=int)
        if org_id:
            stmt = stmt.where(FraudAlert.organisation_id == org_id)
    elif user.role == "industrial":
        if not user.organisation_id:
            return err("Complete your organisation profile first.", 422, "no_organisation")
        stmt = stmt.where(FraudAlert.organisation_id == user.organisation_id)
    else:
        stmt = stmt.join(Document, FraudAlert.document_id == Document.id).where(
            Document.owner_id == user.id)
    status = request.args.get("status")
    if status in ALERT_STATUSES:
        stmt = stmt.where(FraudAlert.status == status)
    else:
        stmt = stmt.where(FraudAlert.status == ALERT_OPEN)
    severity = request.args.get("severity")
    if severity in ("info", "low", "medium", "high", "critical"):
        stmt = stmt.where(FraudAlert.severity == severity)
    alert_type = request.args.get("type")
    if alert_type:
        stmt = stmt.where(FraudAlert.alert_type == alert_type)
    document_id = request.args.get("document_id", type=int)
    if document_id:
        stmt = stmt.where(FraudAlert.document_id == document_id)
    stmt = stmt.order_by(FraudAlert.created_at.desc())
    rows, total, page, per_page = paginate(stmt, default_per_page=20)
    return ok({
        "alerts": [alert.to_dict() for alert in rows],
        "statuses": sorted(ALERT_STATUSES),
        "note": "Alerts are investigative indicators generated from submitted data, not findings of fraud.",
    }, meta=pagination_meta(total, page, per_page))


def _get_alert(alert_id: int) -> FraudAlert:
    alert = db.session.get(FraudAlert, alert_id)
    if not alert:
        raise DocumentError("Alert not found.", 404, "not_found")
    user = g.current_user
    allowed = user.role == "admin"
    if not allowed and user.role == "industrial":
        allowed = bool(user.organisation_id and alert.organisation_id == user.organisation_id)
    if not allowed and alert.document:
        allowed = alert.document.owner_id == user.id
    if not allowed:
        raise DocumentError("Alert not found.", 404, "not_found")
    return alert


@bp.patch("/alerts/<int:alert_id>")
@auth_required
def update_alert(alert_id: int):
    alert = _get_alert(alert_id)
    payload = json_body()
    status = (payload.get("status") or "").strip().lower()
    if status not in ALERT_STATUSES:
        return err("Status must be open, acknowledged or dismissed.", 422, "validation_error")
    alert.status = status
    db.session.commit()
    log_action("fraud.alert_status", "fraud_alert", alert.id, {"status": status})
    db.session.commit()
    return ok({"alert": alert.to_dict()})


@bp.post("/rescan")
@auth_required
def rescan():
    user = g.current_user
    if user.role == "admin":
        org_id = json_body().get("organisation_id") or request.args.get("organisation_id", type=int)
        if not org_id:
            org_id = db.session.scalar(db.select(db.func.min(Organisation.id)))
    else:
        org_id = user.organisation_id
    if not org_id:
        return err("An organisation is required to rescan invoices.", 422, "no_organisation")
    result = rescan_organisation(org_id)
    log_action("fraud.rescan", "organisation", org_id, result)
    db.session.commit()
    return ok({**result, "organisation_id": org_id,
               "note": "Rescan looks for repeated invoice numbers within the workspace. "
                       "Matches are indicators requiring reconciliation against accounting records."})
