"""Health, capability discovery and service metadata."""

import shutil
import tempfile
import time
from pathlib import Path

from flask import Blueprint, current_app

from app.constants import (
    DISCLAIMER, DOC_KIND_LABELS, KINDS_BY_PORTAL, ORG_TYPES, PORTALS, ROLE_LABELS, ROLES,
)
from app.extensions import db
from app.modules.risk_assessment.engine import ml_scorer_available, thresholds
from app.services.ocr_service import available_languages
from app.utils.responses import ok

bp = Blueprint("meta", __name__, url_prefix="/api")

MODULES = [
    {"code": "document_forensics", "name": "AI Document Forensics Engine",
     "summary": "OCR, ELA, copy-move, noise and typography indicators with a visual heatmap."},
    {"code": "smart_verification", "name": "Smart Document Verification",
     "summary": "GSTIN/PAN/IFSC/account format checks, invoice arithmetic, cross-document consistency."},
    {"code": "fraud_intelligence", "name": "AI Fraud Intelligence",
     "summary": "Duplicate DNA matching, repeated identifiers, anomalies, supplier profiles and a relationship graph."},
    {"code": "industrial_intelligence", "name": "Industrial Document Intelligence",
     "summary": "Supplier onboarding, PO checks and expiry monitoring for organisations."},
    {"code": "public_safety", "name": "Public Document Safety Portal",
     "summary": "Offer-letter and certificate screening, PII review, redaction and reporting."},
    {"code": "risk_assessment", "name": "Explainable Risk Assessment",
     "summary": "Transparent weighted signals, configurable thresholds and evidence-backed recommendations."},
]


@bp.get("/health")
def health():
    checks = {}
    started = time.monotonic()
    try:
        db.session.execute(db.select(1))
        checks["database"] = {"status": "ok"}
    except Exception as exc:
        checks["database"] = {"status": "error", "detail": type(exc).__name__}
    try:
        folder = Path(current_app.config["UPLOAD_FOLDER"])
        folder.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=folder, delete=True) as handle:
            handle.write(b"kavacha-health")
        checks["storage"] = {"status": "ok", "writable": True}
    except Exception as exc:
        checks["storage"] = {"status": "error", "detail": type(exc).__name__}
    languages = available_languages()
    checks["ocr"] = {
        "status": "ok" if languages else "degraded",
        "installed_languages": languages,
        "requested_languages": current_app.config["OCR_LANGUAGES"],
    }
    try:
        usage = shutil.disk_usage(current_app.config["STORAGE_ROOT"])
        checks["disk"] = {"free_mb": round(usage.free / (1024 * 1024), 1)}
    except Exception:
        checks["disk"] = {"free_mb": None}
    healthy = all(check.get("status") == "ok" for name, check in checks.items() if name != "disk")
    return ok({
        "status": "ok" if healthy else "degraded",
        "service": "KAVACHA API",
        "version": current_app.config["SOFTWARE_VERSION"],
        "uptime_ms": round((time.monotonic() - started) * 1000, 2),
        "checks": checks,
    }, status=200 if healthy else 503)


@bp.get("/meta")
def service_meta():
    languages = available_languages()
    requested = current_app.config["OCR_LANGUAGES"]
    missing = [language for language in requested if languages and language not in languages]
    external_gst = bool(current_app.config.get("EXTERNAL_GST_API_URL"))
    external_bank = bool(current_app.config.get("EXTERNAL_BANK_API_URL"))
    return ok({
        "service": "KAVACHA",
        "tagline": "One Document. Multiple Checks. Complete Trust.",
        "version": current_app.config["SOFTWARE_VERSION"],
        "environment": current_app.config.get("ENV"),
        "modules": MODULES,
        "roles": [{"value": role, "label": ROLE_LABELS[role]} for role in ROLES],
        "portals": list(PORTALS),
        "doc_kinds": DOC_KIND_LABELS,
        "kinds_by_portal": KINDS_BY_PORTAL,
        "org_types": ORG_TYPES,
        "ocr": {
            "engine": "PyMuPDF text layer with Tesseract fallback",
            "installed_languages": languages,
            "requested_languages": requested,
            "missing_languages": missing,
            "note": ("Kannada OCR data is not installed on this server; documents are processed with English "
                     "and a note is attached to results." if "kan" in missing else
                     "All configured OCR languages are available."),
        },
        "risk": {
            "thresholds": thresholds(),
            "engine": current_app.config.get("RISK_ENGINE_VERSION"),
            "ml_scorer": ml_scorer_available(),
            "note": "Configurable demonstration thresholds, not calibrated fraud probabilities.",
        },
        "external_verification": {
            "gst": {"configured": external_gst,
                    "message": "Authorised GST API configured." if external_gst
                    else "Not configured — external GST verification is NOT performed."},
            "bank": {"configured": external_bank,
                     "message": "Authorised bank API configured." if external_bank
                     else "Not configured — external bank verification is NOT performed."},
        },
        "limits": {
            "max_upload_mb": current_app.config["MAX_UPLOAD_MB"],
            "analysis_pages": current_app.config["ANALYSIS_MAX_PAGES"],
            "ocr_max_words": current_app.config["OCR_MAX_WORDS"],
            "report_expiry_days": current_app.config["REPORT_EXPIRY_DAYS"],
            "default_retention_days": current_app.config["DEFAULT_RETENTION_DAYS"],
        },
        "security": {
            "auth": "JWT (HS256) bearer tokens",
            "password_hashing": "Werkzeug PBKDF2",
            "rate_limits": {
                "auth_per_minute": current_app.config["AUTH_RATE_LIMIT"],
                "api_per_minute": current_app.config["API_RATE_LIMIT"],
            },
            "upload_validation": "extension + magic bytes + parser probe",
            "audit_logging": True,
            "document_urls_public": False,
        },
        "disclaimer": DISCLAIMER,
    })
