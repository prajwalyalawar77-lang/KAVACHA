from datetime import date, timedelta

from sqlalchemy.exc import IntegrityError

from app.constants import (
    ALERT_OPEN,
    SUPPLIER_PENDING,
    SUPPLIER_REVIEW,
    SUPPLIER_VERIFIED,
)
from app.extensions import db
from app.models import Document, FraudAlert, Invoice, Notification, Supplier, VerificationResult
from app.modules.fraud_intelligence.engine import compute_supplier_profile
from app.modules.smart_verification.validators import (
    validate_bank_account,
    validate_gstin,
    validate_ifsc,
    validate_pan,
)
from app.utils.text import name_similarity, normalize_invoice_number, normalize_name
from app.utils.time import iso, utcnow


class SupplierError(Exception):
    def __init__(self, message, status=400, code="supplier_error"):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code


def create_supplier(org_id: int, payload: dict) -> Supplier:
    name = (payload.get("name") or "").strip()
    if len(name) < 2:
        raise SupplierError("Supplier name is required.")
    normalized = normalize_name(name)
    if not normalized:
        raise SupplierError("Supplier name must contain letters or digits.")
    warnings = []
    gstin = (payload.get("gstin") or "").strip().upper() or None
    pan = (payload.get("pan") or "").strip().upper() or None
    ifsc = (payload.get("ifsc") or "").strip().upper() or None
    bank_account = (payload.get("bank_account") or "").strip().replace(" ", "") or None
    if gstin:
        validation = validate_gstin(gstin)
        if not validation["valid"]:
            warnings.append("GSTIN failed structural/checksum validation; supplier kept pending for review.")
    if pan and not validate_pan(pan)["valid"]:
        warnings.append("PAN does not match the expected format.")
    if ifsc and not validate_ifsc(ifsc)["valid"]:
        warnings.append("IFSC does not match the expected format.")
    if bank_account and not validate_bank_account(bank_account)["valid"]:
        warnings.append("Bank account number format is invalid.")
    supplier = Supplier(
        organisation_id=org_id,
        name=name[:255],
        normalized_name=normalized[:255],
        gstin=gstin,
        pan=pan,
        ifsc=ifsc,
        bank_account=bank_account,
        email=(payload.get("email") or "").strip() or None,
        phone=(payload.get("phone") or "").strip() or None,
        address=(payload.get("address") or "").strip() or None,
        status=SUPPLIER_PENDING,
        trust_score=50,
    )
    if warnings:
        supplier.risk_summary = " ".join(warnings)
    db.session.add(supplier)
    try:
        db.session.commit()
    except IntegrityError as exc:
        db.session.rollback()
        raise SupplierError("A supplier with this name already exists in your organisation.", 409, "duplicate_supplier") from exc
    supplier._onboarding_warnings = warnings  # consumed by the route for the response
    return supplier


def update_supplier(supplier: Supplier, payload: dict) -> Supplier:
    if "name" in payload and payload["name"]:
        name = payload["name"].strip()
        normalized = normalize_name(name)
        if not normalized:
            raise SupplierError("Supplier name must contain letters or digits.")
        supplier.name = name[:255]
        supplier.normalized_name = normalized[:255]
    for field in ("gstin", "pan", "ifsc"):
        if field in payload:
            value = (payload.get(field) or "").strip().upper() or None
            setattr(supplier, field, value)
    if "bank_account" in payload:
        supplier.bank_account = (payload.get("bank_account") or "").strip().replace(" ", "") or None
    for field in ("email", "phone", "address", "risk_summary"):
        if field in payload:
            setattr(supplier, field, (payload.get(field) or "").strip() or None)
    supplier.last_verified_at = utcnow() if payload.get("mark_verified") else supplier.last_verified_at
    try:
        db.session.commit()
    except IntegrityError as exc:
        db.session.rollback()
        raise SupplierError("Another supplier already uses this name.", 409, "duplicate_supplier") from exc
    return supplier


def verify_supplier_against_document(supplier: Supplier, document) -> dict:
    ocr = document.ocr_result
    fields = (ocr.fields_json if ocr else {}) or {}
    comparisons = []
    if not fields:
        raise SupplierError("The document has no extracted fields. Run analysis first.", 422, "not_analysed")

    def add(code, label, doc_value, supplier_value, match, note, weight):
        comparisons.append({
            "code": code, "label": label, "document_value": doc_value,
            "supplier_value": supplier_value, "match": match, "note": note, "weight": weight,
        })

    if supplier.gstin and fields.get("gstin"):
        add("gstin", "GSTIN", fields["gstin"], supplier.gstin,
            supplier.gstin.upper() == fields["gstin"].upper(),
            "Exact match required for supplier verification.", 30)
    if supplier.bank_account and fields.get("bank_account"):
        add("bank_account", "Bank account", fields["bank_account"], supplier.bank_account,
            supplier.bank_account == fields["bank_account"],
            "Payment-diversion indicator if mismatched.", 30)
    if supplier.ifsc and fields.get("ifsc"):
        add("ifsc", "IFSC", fields["ifsc"], supplier.ifsc,
            supplier.ifsc.upper() == fields["ifsc"].upper(), "Bank branch consistency.", 10)
    if supplier.name and fields.get("vendor_name"):
        similarity = name_similarity(supplier.name, fields["vendor_name"])
        add("name", "Supplier name", fields["vendor_name"], supplier.name,
            similarity >= 0.6, f"Fuzzy name similarity {similarity:.2f}.", 20)
    if not comparisons:
        raise SupplierError("The document does not contain supplier identifiers to compare.", 422, "no_identifiers")

    total_weight = sum(item["weight"] for item in comparisons)
    matched_weight = sum(item["weight"] for item in comparisons if item["match"])
    ratio = matched_weight / total_weight if total_weight else 0
    if ratio >= 0.99:
        status = SUPPLIER_VERIFIED
    elif ratio >= 0.5:
        status = SUPPLIER_REVIEW
    else:
        status = SUPPLIER_REVIEW
    supplier.status = status
    supplier.last_verified_at = utcnow()
    supplier.trust_score = round(50 + 50 * ratio, 1) if ratio >= 0.99 else round(20 + 50 * ratio, 1)
    supplier.risk_summary = "; ".join(
        f"{item['label']} mismatch" for item in comparisons if not item["match"]
    ) or "Document identifiers match the supplier profile."
    db.session.commit()
    return {
        "supplier": supplier.to_dict(),
        "comparisons": comparisons,
        "match_ratio": round(ratio, 3),
        "status": status,
        "note": "Comparisons use extracted fields and fuzzy name matching. Confirm mismatches manually.",
        "trust_score": supplier.trust_score,
    }


def po_check(invoice_document, po_document) -> dict:
    inv_fields = (invoice_document.ocr_result.fields_json if invoice_document.ocr_result else {}) or {}
    po_fields = (po_document.ocr_result.fields_json if po_document.ocr_result else {}) or {}
    if not inv_fields or not po_fields:
        raise SupplierError("Both documents must be analysed before comparison.", 422, "not_analysed")
    invoice_po = normalize_invoice_number(inv_fields.get("po_number"))
    po_number = normalize_invoice_number(po_fields.get("po_number"))
    checks = []
    if invoice_po and po_number:
        checks.append({
            "code": "po_number_match", "label": "PO number",
            "status": "passed" if invoice_po == po_number else "failed",
            "invoice_value": inv_fields.get("po_number"),
            "po_value": po_fields.get("po_number"),
            "message": "Invoice references the same purchase order number."
            if invoice_po == po_number else "Invoice PO number does not match the purchase order.",
        })
    else:
        checks.append({
            "code": "po_number_match", "label": "PO number", "status": "skipped",
            "message": "A PO number could not be extracted from one or both documents.",
        })
    inv_total = (inv_fields.get("amounts") or {}).get("total")
    po_total = (po_fields.get("amounts") or {}).get("total")
    if inv_total and po_total:
        tolerance = max(1.0, po_total * 0.01)
        delta = abs(inv_total - po_total)
        checks.append({
            "code": "po_amount_match", "label": "Amount",
            "status": "passed" if delta <= tolerance else "failed",
            "invoice_value": inv_total, "po_value": po_total,
            "message": f"Invoice total is within tolerance of the PO total (difference {delta:.2f})."
            if delta <= tolerance else f"Invoice total differs from the PO total by {delta:.2f}.",
        })
    else:
        checks.append({
            "code": "po_amount_match", "label": "Amount", "status": "skipped",
            "message": "Totals could not be extracted from one or both documents.",
        })
    inv_vendor = inv_fields.get("vendor_name")
    po_vendor = po_fields.get("vendor_name")
    if inv_vendor and po_vendor:
        similarity = name_similarity(inv_vendor, po_vendor)
        checks.append({
            "code": "po_supplier_match", "label": "Supplier name",
            "status": "passed" if similarity >= 0.6 else "warning",
            "invoice_value": inv_vendor, "po_value": po_vendor,
            "message": f"Vendor names are {similarity:.2f} similar.",
        })
    else:
        checks.append({
            "code": "po_supplier_match", "label": "Supplier name", "status": "skipped",
            "message": "Supplier names were not available in both documents.",
        })
    inv_date = inv_fields.get("invoice_date")
    po_date = po_fields.get("invoice_date")
    if inv_date and po_date and inv_date < po_date:
        checks.append({
            "code": "po_date_order", "label": "Document date order", "status": "warning",
            "message": f"Invoice date ({inv_date}) is earlier than the PO date ({po_date}).",
        })
    return {
        "invoice": invoice_document.to_dict(),
        "purchase_order": po_document.to_dict(),
        "checks": checks,
        "note": "PO matching compares extracted values; confirm against the original PO and accounting records.",
    }


def industrial_dashboard(org_id: int) -> dict:
    documents = db.session.scalars(
        db.select(Document).where(Document.organisation_id == org_id, Document.deleted_at.is_(None))
        .order_by(Document.created_at.desc()).limit(800)
    ).all()
    suppliers = db.session.scalars(
        db.select(Supplier).where(Supplier.organisation_id == org_id)
    ).all()
    alerts = db.session.scalars(
        db.select(FraudAlert).where(FraudAlert.organisation_id == org_id, FraudAlert.status == ALERT_OPEN)
    ).all()
    analysed = [doc for doc in documents if doc.risk_assessment]
    verified = [doc for doc in analysed if doc.risk_assessment.category == "low"]
    review = [doc for doc in analysed if doc.risk_assessment.category == "medium"]
    high_risk = [doc for doc in analysed if doc.risk_assessment.category in ("high", "critical")]
    today = date.today()
    horizon = today + timedelta(days=60)
    expiring = [doc for doc in documents if doc.expiry_date and today <= doc.expiry_date <= horizon]
    expired = [doc for doc in documents if doc.expiry_date and doc.expiry_date < today]
    monthly = {}
    months = []
    now = utcnow()
    for offset in range(5, -1, -1):
        year, month = now.year, now.month - offset
        while month <= 0:
            month += 12
            year -= 1
        key = f"{year}-{month:02d}"
        months.append(key)
        monthly[key] = {"month": key, "analysed": 0, "verified": 0, "high_risk": 0}
    for doc in analysed:
        key = doc.created_at.strftime("%Y-%m")
        if key in monthly:
            monthly[key]["analysed"] += 1
            if doc.risk_assessment.category == "low":
                monthly[key]["verified"] += 1
            if doc.risk_assessment.category in ("high", "critical"):
                monthly[key]["high_risk"] += 1
    type_counts = {}
    for doc in analysed:
        type_counts[doc.doc_kind] = type_counts.get(doc.doc_kind, 0) + 1
    supplier_status = {"total": len(suppliers), "pending": 0, "verified": 0, "review_required": 0, "flagged": 0}
    for supplier in suppliers:
        supplier_status[supplier.status] = supplier_status.get(supplier.status, 0) + 1
    top_docs = sorted(analysed, key=lambda d: d.risk_assessment.score, reverse=True)[:6]
    top_suppliers = sorted(
        [s for s in suppliers if s.trust_score is not None],
        key=lambda s: s.trust_score,
    )[:6]
    return {
        "counts": {
            "total_documents": len(documents),
            "analysed": len(analysed),
            "verified_low_risk": len(verified),
            "requires_review": len(review),
            "high_risk": len(high_risk),
            "open_alerts": len(alerts),
            "expiring_60d": len(expiring),
            "expired": len(expired),
        },
        "supplier_status": supplier_status,
        "monthly": [monthly[key] for key in months],
        "document_types": [{"kind": kind, "count": count} for kind, count in
                           sorted(type_counts.items(), key=lambda kv: kv[1], reverse=True)],
        "top_documents": [doc.to_dict() for doc in top_docs],
        "top_suppliers": [supplier.to_dict(include_stats=True) for supplier in top_suppliers],
        "expiring_documents": [doc.to_dict() for doc in expiring[:8]],
        "expired_documents": [doc.to_dict() for doc in expired[:8]],
        "recent_alerts": [alert.to_dict() for alert in alerts[:6]],
        "definitions": {
            "verified_low_risk": "Analysed documents with a low-risk score under the configured thresholds.",
            "requires_review": "Medium-risk documents.",
            "high_risk": "High or critical risk documents that need priority review.",
        },
        "disclaimer": "Buckets are derived from configurable risk thresholds, not calibrated fraud probabilities.",
    }


def expiry_scan(org_id: int, horizon_days: int = 60) -> dict:
    today = date.today()
    horizon = today + timedelta(days=horizon_days)
    documents = db.session.scalars(
        db.select(Document).where(
            Document.organisation_id == org_id,
            Document.deleted_at.is_(None),
            Document.expiry_date.is_not(None),
            Document.expiry_date <= horizon,
        )
    ).all()
    created = 0
    for document in documents:
        expired = document.expiry_date < today
        title = ("Document expired" if expired else "Document expiring soon") + f": {document.original_filename}"
        existing = db.session.scalars(
            db.select(Notification).where(
                Notification.organisation_id == org_id,
                Notification.kind == "expiry",
                Notification.title == title,
                Notification.created_at >= utcnow() - timedelta(days=7),
            )
        ).first()
        if existing:
            continue
        notification = Notification(
            organisation_id=org_id,
            kind="expiry",
            severity="high" if expired else "medium",
            title=title,
            message=(f"This {document.doc_kind.replace('_', ' ')} expired on {document.expiry_date.isoformat()}."
                     if expired else
                     f"This {document.doc_kind.replace('_', ' ')} expires on {document.expiry_date.isoformat()}."),
            link=f"/app/documents/{document.id}",
        )
        db.session.add(notification)
        created += 1
    db.session.commit()
    return {"scanned": len(documents), "notifications_created": created, "horizon_days": horizon_days}
