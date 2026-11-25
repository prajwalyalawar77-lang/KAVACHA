"""Industrial portal: supplier management, dashboards, PO checks, expiry alerts."""

from flask import Blueprint, g, request

from app.constants import EXPIRY_KINDS
from app.extensions import db
from app.models import Document, Supplier
from app.modules.fraud_intelligence.engine import compute_supplier_profile
from app.modules.industrial_intelligence.engine import (
    create_supplier, expiry_scan, industrial_dashboard, po_check, update_supplier,
    verify_supplier_against_document,
)
from app.routes.deps import get_document, json_body, paginate
from app.services.audit_service import log_action
from app.services.document_service import DocumentError
from app.utils.responses import created, err, ok, pagination_meta
from app.utils.security import auth_required
from app.utils.time import parse_date

bp = Blueprint("industrial", __name__, url_prefix="/api/industrial")


def _org_id(payload: dict | None = None) -> int:
    user = g.current_user
    if user.role == "admin":
        raw = (payload or {}).get("organisation_id") or request.args.get("organisation_id", type=int)
        try:
            org_id = int(raw)
        except (TypeError, ValueError):
            raise DocumentError("Select an organisation for this industrial action.", 422, "organisation_required")
        return org_id
    if user.role != "industrial":
        raise DocumentError("The industrial portal is available to organisation accounts.", 403, "forbidden")
    if not user.organisation_id:
        raise DocumentError("Complete your organisation profile first.", 422, "no_organisation")
    return user.organisation_id


def _get_supplier(supplier_id: int) -> Supplier:
    supplier = db.session.get(Supplier, supplier_id)
    if not supplier:
        raise DocumentError("Supplier not found.", 404, "not_found")
    user = g.current_user
    if user.role != "admin" and supplier.organisation_id != user.organisation_id:
        raise DocumentError("Supplier not found.", 404, "not_found")
    return supplier


@bp.get("/dashboard")
@auth_required
def dashboard():
    org_id = _org_id()
    data = industrial_dashboard(org_id)
    data["organisation_id"] = org_id
    return ok(data)


@bp.get("/suppliers")
@auth_required
def list_suppliers():
    org_id = _org_id()
    stmt = db.select(Supplier).where(Supplier.organisation_id == org_id)
    query = (request.args.get("q") or "").strip()
    if query:
        stmt = stmt.where(db.or_(
            Supplier.name.ilike(f"%{query}%"),
            Supplier.gstin.ilike(f"%{query}%"),
        ))
    status = request.args.get("status")
    if status in ("pending", "verified", "review_required", "flagged"):
        stmt = stmt.where(Supplier.status == status)
    stmt = stmt.order_by(Supplier.name.asc())
    rows, total, page, per_page = paginate(stmt, default_per_page=20)
    return ok({
        "suppliers": [row.to_dict(include_stats=True) for row in rows],
        "organisation_id": org_id,
    }, meta=pagination_meta(total, page, per_page))


@bp.post("/suppliers")
@auth_required
def add_supplier():
    payload = json_body()
    org_id = _org_id(payload)
    supplier = create_supplier(org_id, payload)
    warnings = getattr(supplier, "_onboarding_warnings", []) or []
    log_action("supplier.create", "supplier", supplier.id, {"name": supplier.name})
    db.session.commit()
    return created({
        "supplier": supplier.to_dict(),
        "warnings": warnings,
        "note": "Supplier records start as 'pending'. Verify identifiers against a document and "
                "official sources before relying on them. No government lookup is performed here.",
    })


@bp.get("/suppliers/<int:supplier_id>")
@auth_required
def supplier_detail(supplier_id: int):
    supplier = _get_supplier(supplier_id)
    profile = compute_supplier_profile(supplier, persist=False)
    checks = db.session.scalars(
        db.select(Document).where(Document.id.in_([inv.document_id for inv in supplier.invoices]))
    ).all() if supplier.invoices else []
    return ok({
        "supplier": supplier.to_dict(include_stats=True),
        "profile": profile,
        "documents": [{
            "id": doc.id, "name": doc.original_filename, "doc_kind": doc.doc_kind,
            "status": doc.status,
            "risk": doc.risk_assessment.to_dict() if doc.risk_assessment else None,
            "expiry_date": doc.expiry_date.isoformat() if doc.expiry_date else None,
        } for doc in sorted(checks, key=lambda d: d.created_at, reverse=True)],
    })


@bp.patch("/suppliers/<int:supplier_id>")
@auth_required
def edit_supplier(supplier_id: int):
    supplier = _get_supplier(supplier_id)
    if g.current_user.role == "public":
        return err("Suppliers are managed by industrial accounts.", 403, "forbidden")
    payload = json_body()
    supplier = update_supplier(supplier, payload)
    log_action("supplier.update", "supplier", supplier.id, {"fields": sorted(payload.keys())})
    db.session.commit()
    return ok({"supplier": supplier.to_dict()})


@bp.post("/suppliers/<int:supplier_id>/verify")
@auth_required
def verify_supplier(supplier_id: int):
    supplier = _get_supplier(supplier_id)
    payload = json_body()
    document_id = payload.get("document_id")
    if not document_id:
        return err("Choose an analysed document to verify the supplier against.", 422, "document_required")
    document = get_document(int(document_id), g.current_user)
    if document.organisation_id != supplier.organisation_id and g.current_user.role != "admin":
        return err("The document belongs to a different organisation.", 403, "forbidden")
    result = verify_supplier_against_document(supplier, document)
    log_action("supplier.verify", "supplier", supplier.id, {"document_id": document.id})
    db.session.commit()
    return ok(result)


@bp.post("/suppliers/<int:supplier_id>/refresh-profile")
@auth_required
def refresh_supplier_profile(supplier_id: int):
    supplier = _get_supplier(supplier_id)
    profile = compute_supplier_profile(supplier, persist=True)
    db.session.commit()
    log_action("supplier.profile_refresh", "supplier", supplier.id, {"risk_score": profile["risk_score"]})
    db.session.commit()
    return ok(profile)


@bp.post("/po-check")
@auth_required
def purchase_order_check():
    payload = json_body()
    invoice_id = payload.get("invoice_id")
    po_id = payload.get("po_id")
    if not invoice_id or not po_id:
        return err("Provide invoice_id and po_id.", 422, "validation_error")
    invoice_doc = get_document(int(invoice_id), g.current_user)
    po_doc = get_document(int(po_id), g.current_user)
    result = po_check(invoice_doc, po_doc)
    log_action("industrial.po_check", "document", invoice_doc.id, {"po_document_id": po_doc.id})
    db.session.commit()
    return ok(result)


@bp.get("/expiry-alerts")
@auth_required
def expiry_alerts():
    org_id = _org_id()
    horizon = min(365, max(1, request.args.get("days", type=int) or 60))
    stmt = db.select(Document).where(
        Document.organisation_id == org_id,
        Document.deleted_at.is_(None),
        Document.doc_kind.in_(sorted(EXPIRY_KINDS)),
        Document.expiry_date.is_not(None),
    ).order_by(Document.expiry_date.asc())
    rows = db.session.scalars(stmt).all()
    from datetime import timedelta

    from app.utils.time import utcnow

    today, _ = parse_date(request.args.get("today"))
    reference = today or utcnow().date()
    horizon_date = reference + timedelta(days=horizon)
    expired = [doc for doc in rows if doc.expiry_date < reference]
    expiring = [doc for doc in rows if reference <= doc.expiry_date <= horizon_date]
    shape = lambda doc: {
        "id": doc.id, "name": doc.original_filename, "doc_kind": doc.doc_kind,
        "expiry_date": doc.expiry_date.isoformat(),
        "days_remaining": (doc.expiry_date - reference).days,
    }
    return ok({
        "organisation_id": org_id,
        "horizon_days": horizon,
        "expired": [shape(doc) for doc in expired],
        "expiring": [shape(doc) for doc in expiring],
        "note": "Expiry dates come from extracted document text or values you entered. "
                "Confirm renewal status with the issuing authority.",
    })


@bp.post("/expiry-scan")
@auth_required
def run_expiry_scan():
    org_id = _org_id()
    raw_horizon = json_body().get("horizon_days") or 60
    try:
        horizon = min(365, max(1, int(raw_horizon)))
    except (TypeError, ValueError):
        horizon = 60
    result = expiry_scan(org_id, horizon)
    log_action("industrial.expiry_scan", "organisation", org_id, result)
    db.session.commit()
    return ok({**result, "organisation_id": org_id})
