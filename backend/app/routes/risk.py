"""Explainable risk assessment endpoints."""

from flask import Blueprint, current_app, g

from app.modules.risk_assessment.engine import ml_scorer_available, thresholds
from app.routes.deps import get_document, json_body
from app.services.document_service import DocumentError
from app.utils.responses import err, ok
from app.utils.security import admin_required, auth_required
from app.utils.validation import parse_int

bp = Blueprint("risk", __name__, url_prefix="/api/risk")


@bp.get("/thresholds")
@auth_required
def get_thresholds():
    return ok({
        "thresholds": thresholds(),
        "labels": {
            "low": "0 to medium threshold",
            "medium": "medium threshold to high threshold",
            "high": "high threshold to critical threshold",
            "critical": "critical threshold to 100",
        },
        "note": "These are configurable demonstration thresholds, not calibrated fraud probabilities.",
        "ml_scorer": ml_scorer_available(),
        "engine": current_app.config.get("RISK_ENGINE_VERSION"),
    })


@bp.get("/<int:document_id>")
@auth_required
def document_risk(document_id: int):
    document = get_document(document_id, g.current_user)
    risk = document.risk_assessment
    if not risk:
        raise DocumentError("Run document analysis to generate a risk assessment.", 422, "not_analysed")
    checks = [check.to_dict() for check in document.verification_results]
    grouped = {"passed": [], "failed": [], "warning": [], "skipped": [], "unverified": []}
    for check in checks:
        grouped.setdefault(check["status"], []).append({
            "code": check["code"], "name": check["name"],
            "message": check["message"], "category": check["category"],
        })
    total_checks = len(checks)
    return ok({
        "document": document.to_dict(include_summary=True),
        "risk": risk.to_dict(),
        "checks": checks,
        "checks_by_status": grouped,
        "completion": {
            "total": total_checks,
            "completed": total_checks - len(grouped["skipped"]) - len(grouped["unverified"]),
            "not_completed": len(grouped["skipped"]) + len(grouped["unverified"]),
        },
        "evidence": {
            "forensic_indicators": document.tampering.indicators_json if document.tampering else [],
            "metadata_indicators": (document.metadata_record.raw_json or {}).get("indicators", [])
            if document.metadata_record else [],
            "alerts": [alert.to_dict() for alert in document.alerts if alert.status == "open"],
        },
        "integrity": {
            "sha256": document.sha256,
            "dhash": document.fingerprint.dhash if document.fingerprint else None,
            "exact_duplicate_of": [
                alert.evidence_json for alert in document.alerts
                if alert.alert_type == "duplicate_document"
            ],
        },
        "note": "The score combines transparent rule weights from completed checks. "
                "Failed/partial checks reduce confidence; missing checks are not treated as passes.",
    })


@bp.put("/thresholds")
@admin_required
def update_thresholds():
    payload = json_body()
    current = thresholds()
    values = {}
    for key in ("medium", "high", "critical"):
        value = parse_int(payload.get(key, current[key]), None, 1, 99)
        if value is None:
            return err(f"Threshold '{key}' must be an integer between 1 and 99.", 422, "validation_error")
        values[key] = value
    if not (values["medium"] < values["high"] < values["critical"]):
        return err("Thresholds must satisfy medium < high < critical.", 422, "validation_error")
    current_app.config["RISK_MEDIUM_THRESHOLD"] = values["medium"]
    current_app.config["RISK_HIGH_THRESHOLD"] = values["high"]
    current_app.config["RISK_CRITICAL_THRESHOLD"] = values["critical"]
    from app.services.audit_service import log_action

    log_action("risk.thresholds_update", "config", None, values)
    return ok({
        "thresholds": values,
        "note": "Thresholds apply to new analyses in this process and reset on restart. "
                "Set RISK_*_THRESHOLD environment variables to persist them.",
    })
