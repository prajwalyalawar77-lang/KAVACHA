"""Smart verification: extracted fields, validators, version and multi-document comparison."""

from flask import Blueprint, g

from app.extensions import db
from app.models import DocumentVersion
from app.modules.smart_verification.comparison import ComparisonError, compare_pair, multi_compare
from app.modules.smart_verification.validators import (
    validate_bank_account, validate_gstin, validate_ifsc, validate_invoice_number, validate_pan,
)
from app.routes.deps import get_document, json_body
from app.services.audit_service import log_action
from app.utils.responses import ok
from app.utils.security import auth_required

bp = Blueprint("verification", __name__, url_prefix="/api/verification")


@bp.get("/<int:document_id>")
@bp.get("/<int:document_id>/checks")
@auth_required
def verification_detail(document_id: int):
    document = get_document(document_id, g.current_user)
    if not document.ocr_result:
        raise ComparisonError("This document has not been analysed yet. Run analysis first.", 422, "not_analysed")
    fields = document.ocr_result.fields_json or {}
    return ok({
        "document": document.to_dict(include_summary=True),
        "checks": [check.to_dict() for check in document.verification_results],
        "extracted": {
            "fields": fields.get("fields", {}),
            "amounts": fields.get("amounts", {}),
            "tax_rates": fields.get("tax_rates", {}),
            "gstins": fields.get("gstins", []),
            "pans": fields.get("pans", []),
            "ifscs": fields.get("ifscs", []),
            "invoice_number": fields.get("invoice_number"),
            "invoice_date": fields.get("invoice_date"),
            "expiry_date": fields.get("expiry_date"),
            "vendor_name": fields.get("vendor_name"),
            "buyer_name": fields.get("buyer_name"),
            "po_number": fields.get("po_number"),
            "bank_account": fields.get("bank_account"),
            "ifsc": fields.get("ifsc"),
            "bank_name": fields.get("bank_name"),
            "salary_amount": fields.get("salary_amount"),
            "emails": fields.get("emails", []),
            "phones": fields.get("phones", []),
            "hsn_codes": fields.get("hsn_codes", []),
            "place_of_supply": fields.get("place_of_supply"),
            "irn": fields.get("irn"),
        },
        "supplier": document.invoices[0].supplier.to_dict() if document.invoices and document.invoices[0].supplier else None,
        "ocr": document.ocr_result.to_dict(include_text=False),
        "note": "Field extraction is heuristic. Values marked with low confidence should be confirmed "
                "against the original document; format checks do not prove registration or ownership.",
    })


@bp.post("/validate")
@bp.post("/validate-fields")
@auth_required
def validate_fields():
    payload = json_body()
    results = {}
    if payload.get("gstin"):
        results["gstin"] = validate_gstin(payload["gstin"])
    if payload.get("pan"):
        results["pan"] = validate_pan(payload["pan"])
    if payload.get("ifsc"):
        results["ifsc"] = validate_ifsc(payload["ifsc"])
    if payload.get("bank_account"):
        results["bank_account"] = validate_bank_account(payload["bank_account"])
    if payload.get("invoice_number"):
        results["invoice_number"] = validate_invoice_number(payload["invoice_number"])
    return ok({
        "results": results,
        "note": "All checks are offline format/checksum validation. No government or bank lookup is performed.",
    })


@bp.post("/compare")
@auth_required
def compare_documents():
    payload = json_body()
    left_id = payload.get("left_id") or payload.get("base_id")
    right_id = payload.get("right_id") or payload.get("compared_id")
    if not left_id or not right_id:
        raise ComparisonError("Provide left_id and right_id to compare two documents.")
    user = g.current_user
    left = get_document(int(left_id), user)
    right = get_document(int(right_id), user)
    if left.id == right.id:
        raise ComparisonError("Choose two different documents to compare.")
    result = compare_pair(left, right)
    log_action("document.compare", "document", left.id, {"compared_with": right.id})
    return ok(result)


@bp.post("/multi")
@auth_required
def compare_multiple():
    payload = json_body()
    ids = payload.get("document_ids") or payload.get("ids") or []
    if not isinstance(ids, list):
        raise ComparisonError("document_ids must be a list of document identifiers.")
    user = g.current_user
    documents = []
    seen = set()
    for raw_id in ids[:6]:
        try:
            document = get_document(int(raw_id), user)
        except (TypeError, ValueError):
            raise ComparisonError("One of the document identifiers is invalid.")
        if document.id not in seen:
            seen.add(document.id)
            documents.append(document)
    result = multi_compare(documents)
    log_action("document.multi_compare", None, None, {"document_ids": list(seen)})
    return ok(result)


@bp.get("/comparisons")
@auth_required
def comparison_history():
    user = g.current_user
    if user.role == "public":
        return ok({"comparisons": [], "note": "Comparison history is stored for organisation accounts."})
    stmt = db.select(DocumentVersion).order_by(DocumentVersion.created_at.desc()).limit(30)
    if user.role == "industrial":
        stmt = stmt.where(DocumentVersion.organisation_id == user.organisation_id)
    rows = db.session.scalars(stmt).all()
    return ok({
        "comparisons": [
            {**row.to_dict(),
             "base_name": row.base_document.original_filename if row.base_document else None,
             "compared_name": row.compared_document.original_filename if row.compared_document else None}
            for row in rows
        ],
    })
