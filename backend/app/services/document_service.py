"""Upload, analysis orchestration and secure deletion for documents."""

import uuid as uuid_lib
from concurrent.futures import ThreadPoolExecutor

from flask import current_app

from app.constants import (
    DOC_STATUS_ANALYSED, DOC_STATUS_DELETED, DOC_STATUS_FAILED, DOC_STATUS_PROCESSING,
    DOC_STATUS_UPLOADED, KINDS_BY_PORTAL, PORTAL_PUBLIC, PORTALS, RISK_CRITICAL, RISK_HIGH,
)
from app.extensions import db
from app.models import (
    Document, DocumentFingerprint, DocumentMetadata, FraudAlert, Invoice, Notification,
    OCRResult, RiskAssessment, SuspiciousRegion, TamperingAnalysis, VerificationResult,
    VerificationReport,
)
from app.modules.document_forensics.engine import analyze_document
from app.modules.fraud_intelligence.engine import compute_supplier_profile, find_supplier, scan_document
from app.modules.public_safety.engine import detect_pii, run_public_checks
from app.modules.risk_assessment.engine import assess
from app.modules.smart_verification.engine import run_verification_checks
from app.modules.smart_verification.extraction import extract_fields
from app.services.audit_service import log_action
from app.services.file_service import delete_document_files, document_absolute_path, save_upload
from app.services.metadata_service import examine
from app.services.ocr_service import extract_text
from app.utils.text import dumps, json_safe
from app.utils.time import iso, parse_date, utcnow


class DocumentError(Exception):
    def __init__(self, message, status=400, code="document_error"):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code


STEPS = [
    {"code": "stored", "label": "File validated & stored"},
    {"code": "metadata_ocr", "label": "Metadata inspection & OCR"},
    {"code": "forensics", "label": "Visual forensics"},
    {"code": "verification", "label": "Smart verification checks"},
    {"code": "fraud", "label": "Fraud intelligence scan"},
    {"code": "risk", "label": "Explainable risk assessment"},
]


def _expiry_from_fields(fields: dict):
    raw = fields.get("expiry_date")
    if not raw:
        return None
    parsed, error = parse_date(raw)
    return parsed if not error else None


def create_document(file_storage, user, portal: str, doc_kind: str, language: str | None = None,
                    expiry_date=None) -> Document:
    portal = (portal or "").strip().lower()
    if portal not in PORTALS:
        raise DocumentError("Select a valid portal (industrial or public).")
    if user.role == "public" and portal != "public":
        raise DocumentError("Public accounts can only upload through the public safety portal.", 403, "forbidden")
    if user.role == "industrial" and portal != "industrial":
        raise DocumentError("Industrial accounts must use the industrial portal.", 403, "forbidden")
    allowed_kinds = KINDS_BY_PORTAL[portal]
    doc_kind = (doc_kind or "other").strip().lower()
    if doc_kind not in allowed_kinds:
        raise DocumentError(f"'{doc_kind}' is not a valid document type for the {portal} portal.")
    if user.role == "industrial" and not user.organisation_id:
        raise DocumentError("Complete your organisation profile before uploading business documents.", 422)

    default_languages = current_app.config.get("OCR_LANGUAGES") or ["eng"]
    if isinstance(default_languages, str):
        default_languages = [part.strip() for part in default_languages.split(",") if part.strip()]
    upload = save_upload(file_storage)
    document = Document(
        uuid=uuid_lib.uuid4().hex,
        owner_id=user.id,
        organisation_id=user.organisation_id if portal == "industrial" else None,
        original_filename=upload["original_filename"],
        stored_path=upload["stored_path"],
        mime_type=upload["mime_type"],
        file_size=upload["file_size"],
        sha256=upload["sha256"],
        portal=portal,
        doc_kind=doc_kind,
        status=DOC_STATUS_UPLOADED,
        status_message="Uploaded and validated.",
        language=language or (default_languages[0] if default_languages else "eng"),
        page_count=upload.get("page_count"),
    )
    parsed_expiry, expiry_error = parse_date(expiry_date) if expiry_date else (None, None)
    if parsed_expiry:
        document.expiry_date = parsed_expiry
    try:
        db.session.add(document)
        db.session.flush()
        db.session.add(DocumentFingerprint(
            document_id=document.id,
            sha256=document.sha256,
            dhash=upload.get("dhash"),
            ahash=upload.get("ahash"),
            width=upload.get("width"),
            height=upload.get("height"),
        ))
        db.session.commit()
    except Exception:
        db.session.rollback()
        delete_document_files(document)
        raise
    log_action("document.upload", "document", document.id, {
        "file": document.original_filename, "portal": portal, "kind": doc_kind,
        "sha256": document.sha256,
    }, user=user)
    return document


def _save_metadata(document: Document, meta: dict) -> None:
    data = meta["metadata"]
    record = document.metadata_record or DocumentMetadata(document_id=document.id)
    for field in (
        "title", "author", "subject", "keywords", "creator", "producer", "creation_date",
        "modification_date", "pdf_version", "is_encrypted", "has_signature", "signature_count",
        "sig_flags", "incremental_updates", "page_count",
    ):
        setattr(record, field, data.get(field))
    record.fonts_json = data.get("fonts") or []
    record.images_json = data.get("images") or []
    raw = dict(data.get("raw") or {})
    raw["indicators"] = meta.get("indicators") or []
    record.raw_json = json_safe(raw)
    if record.id is None:
        db.session.add(record)
    document.metadata_record = record


def _save_ocr(document: Document, ocr: dict, fields: dict) -> OCRResult:
    record = document.ocr_result or OCRResult(document_id=document.id)
    record.engine = ocr.get("engine")
    record.language = ocr.get("language")
    record.requested_language = ocr.get("requested_language")
    record.mean_confidence = ocr.get("mean_confidence")
    record.text = ocr.get("text") or ""
    record.words_json = dumps(ocr.get("words") or [])
    record.fields_json = json_safe(fields)
    record.word_count = ocr.get("word_count") or 0
    record.duration_ms = ocr.get("duration_ms")
    record.status = ocr.get("status") or "ok"
    record.note = ocr.get("note")
    if record.id is None:
        db.session.add(record)
    document.ocr_result = record
    return record


def _save_tampering(document: Document, result: dict) -> TamperingAnalysis:
    record = document.tampering or TamperingAnalysis(document_id=document.id)
    record.engine_version = result.get("engine_version")
    record.analysis_pages = result.get("analysis_pages") or 0
    for field in (
        "ela_mean", "ela_high_fraction", "copy_move_pairs", "copy_move_score",
        "noise_outlier_fraction", "blockiness", "blur_score", "estimated_quality",
        "font_anomalies", "has_signature", "signature_count", "incremental_updates",
        "heatmap_path", "overlay_path", "preview_path", "notes",
    ):
        setattr(record, field, result.get(field))
    record.indicators_json = json_safe(result.get("indicators") or [])
    if record.id is None:
        db.session.add(record)
        db.session.flush()
    else:
        for region in list(record.regions):
            db.session.delete(region)
        db.session.flush()
    document.tampering = record
    for region in result.get("regions") or []:
        db.session.add(SuspiciousRegion(
            document_id=document.id,
            tampering_id=record.id,
            x=region["x"], y=region["y"], w=region["w"], h=region["h"],
            score=region.get("score") or 0,
            label=region.get("label"),
            reason=region.get("reason"),
            sources=json_safe(region.get("sources") or []),
        ))
    return record


def _save_checks(document: Document, checks: list[dict]) -> None:
    db.session.execute(
        db.delete(VerificationResult).where(VerificationResult.document_id == document.id)
    )
    for check in checks:
        db.session.add(VerificationResult(
            document_id=document.id,
            check_code=check["code"],
            check_name=check["name"],
            category=check.get("category", "verification"),
            status=check["status"],
            severity=check.get("severity", "info"),
            message=check.get("message"),
            expected=str(check["expected"])[:255] if check.get("expected") is not None else None,
            actual=str(check["actual"])[:255] if check.get("actual") is not None else None,
            details=json_safe(check.get("details") or {}),
        ))


def _save_risk(document: Document, risk: dict) -> RiskAssessment:
    record = document.risk_assessment or RiskAssessment(document_id=document.id)
    counts = risk["counts"]
    record.score = risk["score"]
    record.category = risk["category"]
    record.confidence = risk["confidence"]
    record.passed_count = counts.get("passed", 0)
    record.failed_count = counts.get("failed", 0)
    record.warning_count = counts.get("warning", 0)
    record.skipped_count = counts.get("skipped", 0)
    record.summary = risk["summary"]
    record.signals_json = json_safe(risk["signals"])
    record.recommendations_json = risk["recommendations"]
    record.thresholds_json = risk["thresholds"]
    record.engine_version = risk["engine_version"]
    if record.id is None:
        db.session.add(record)
    document.risk_assessment = record
    return record


def _save_invoice(document: Document, fields: dict, supplier) -> Invoice | None:
    amounts = fields.get("amounts") or {}
    if not any(amounts.get(key) is not None for key in ("total", "taxable", "tax_total")) \
            and not fields.get("invoice_number"):
        return None
    record = document.invoices[0] if document.invoices else Invoice(document_id=document.id)
    record.organisation_id = document.organisation_id
    record.supplier_id = supplier.id if supplier else None
    record.invoice_number = fields.get("invoice_number")
    record.normalized_number = fields.get("normalized_invoice_number")
    parsed_date, _ = parse_date(fields.get("invoice_date"))
    record.invoice_date = parsed_date
    record.taxable_amount = amounts.get("taxable")
    record.tax_amount = amounts.get("tax_total")
    record.total_amount = amounts.get("total")
    record.po_number = fields.get("po_number")
    record.gstin = fields.get("gstin")
    record.vendor_name = fields.get("vendor_name")
    record.buyer_name = fields.get("buyer_name")
    if record.id is None:
        db.session.add(record)
    return record


def _notify_critical(document: Document, risk: dict) -> None:
    if risk["category"] not in (RISK_HIGH, RISK_CRITICAL):
        return
    link = f"/documents/{document.id}"
    existing = db.session.scalar(
        db.select(Notification).where(
            Notification.user_id == document.owner_id,
            Notification.link == link,
            Notification.kind == "risk_alert",
        ).limit(1)
    )
    if existing:
        existing.message = risk["summary"]
        existing.severity = "critical" if risk["category"] == RISK_CRITICAL else "high"
        return
    db.session.add(Notification(
        user_id=document.owner_id,
        organisation_id=document.organisation_id,
        kind="risk_alert",
        severity="critical" if risk["category"] == RISK_CRITICAL else "high",
        title=f"{risk['category'].title()} risk: {document.original_filename}",
        message=risk["summary"],
        link=link,
    ))


def run_analysis(document: Document, requested_language: str | None = None) -> dict:
    document_id = document.id
    if document.deleted_at:
        raise DocumentError("This document has been deleted.", 410, "deleted")
    document.status = DOC_STATUS_PROCESSING
    document.error_message = None
    document.status_message = "Inspecting metadata and extracting text…"
    db.session.commit()
    try:
        path = document_absolute_path(document)
        app = current_app._get_current_object()

        def _in_context(fn, *args):
            # Worker threads do not inherit Flask's app context.
            with app.app_context():
                return fn(*args)

        with ThreadPoolExecutor(max_workers=2) as pool:
            metadata_future = pool.submit(_in_context, examine, path, document.mime_type)
            ocr_future = pool.submit(
                _in_context, extract_text, path, document.mime_type,
                requested_language or document.language or "eng",
            )
            meta = metadata_future.result()
            ocr = ocr_future.result()

        _save_metadata(document, meta)
        fields = extract_fields(ocr.get("text") or "", ocr.get("words") or [],
                                ocr.get("mean_confidence"), document.doc_kind)
        _save_ocr(document, ocr, fields)
        document.language = ocr.get("language") or document.language
        meta_pages = (meta["metadata"] or {}).get("page_count") or 1
        document.page_count = max(meta_pages, ocr.get("page_count") or 1)
        extracted_expiry = _expiry_from_fields(fields)
        if extracted_expiry:
            document.expiry_date = extracted_expiry
        document.status_message = "Analysing visual forensics on page 1…"
        db.session.commit()

        tampering = analyze_document(document, ocr.get("words") or [])
        _save_tampering(document, tampering)

        document.status_message = "Running verification and fraud checks…"
        db.session.commit()
        supplier = find_supplier(document.organisation_id, fields.get("gstin"), fields.get("vendor_name"))
        checks = run_verification_checks(
            document, fields, meta, ocr,
            organisation=document.organisation, supplier=supplier,
        )
        pii = []
        if document.portal == PORTAL_PUBLIC:
            text = ocr.get("text") or ""
            pii = detect_pii(text, ocr.get("words") or [])
            checks.extend(run_public_checks(document, text, fields, pii))
            document.status_message = "Applying privacy and safety checks…"
            db.session.commit()

        _save_invoice(document, fields, supplier)
        db.session.flush()
        scan = scan_document(document, fields, supplier)
        risk = assess(document, checks, tampering, meta, scan["alerts"], ocr)
        _save_checks(document, checks)
        _save_risk(document, risk)
        if supplier:
            compute_supplier_profile(supplier, persist=True)
        _notify_critical(document, risk)
        document.status = DOC_STATUS_ANALYSED
        document.status_message = f"Analysis complete — {risk['category'].title()} risk ({risk['score']:.0f}/100)."
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        failed = db.session.get(Document, document_id)
        if failed:
            failed.status = DOC_STATUS_FAILED
            failed.status_message = "Analysis failed."
            failed.error_message = f"{type(exc).__name__}: {str(exc)[:400]}"
            db.session.commit()
        raise

    log_action("document.analyse", "document", document_id, {
        "risk_score": risk["score"], "risk_category": risk["category"],
        "alerts": len(scan["alerts"]), "checks": len(checks),
    })
    return {
        "document_id": document_id,
        "status": document.status,
        "risk": {
            "score": risk["score"],
            "category": risk["category"],
            "confidence": risk["confidence"],
            "summary": risk["summary"],
        },
        "counts": risk["counts"],
        "checks_total": len(checks),
        "alerts_created": len(scan["alerts"]),
        "pii_detected": len(pii),
        "ocr": {
            "engine": ocr.get("engine"),
            "language": ocr.get("language"),
            "mean_confidence": ocr.get("mean_confidence"),
            "status": ocr.get("status"),
            "note": ocr.get("note"),
        },
        "expiry_date": iso(document.expiry_date),
        "supplier_id": supplier.id if supplier else None,
    }


def analysis_progress(document: Document) -> dict:
    done = {
        "stored": True,
        "metadata_ocr": document.ocr_result is not None and document.metadata_record is not None,
        "forensics": document.tampering is not None,
        "verification": bool(document.verification_results),
        "fraud": document.risk_assessment is not None,
        "risk": document.risk_assessment is not None,
    }
    steps = []
    reached_pending = False
    for step in STEPS:
        if done.get(step["code"]):
            state = "done"
        elif document.status == DOC_STATUS_FAILED:
            state = "failed"
        elif reached_pending:
            state = "pending"
        else:
            state = "active"
            reached_pending = True
        steps.append({**step, "state": state})
    percent = {DOC_STATUS_UPLOADED: 5, DOC_STATUS_PROCESSING: 55, DOC_STATUS_ANALYSED: 100,
               DOC_STATUS_FAILED: 100}.get(document.status, 0)
    return {
        "status": document.status,
        "message": document.status_message,
        "error": document.error_message,
        "percent": percent,
        "steps": steps,
    }


def document_detail(document: Document) -> dict:
    data = document.to_dict(include_summary=True)
    data.update({
        "metadata": document.metadata_record.to_dict() if document.metadata_record else None,
        "ocr": document.ocr_result.to_dict(include_text=True) if document.ocr_result else None,
        "tampering": document.tampering.to_dict() if document.tampering else None,
        "checks": [check.to_dict() for check in document.verification_results],
        "risk": document.risk_assessment.to_dict() if document.risk_assessment else None,
        "fingerprint": document.fingerprint.to_dict() if document.fingerprint else None,
        "invoice": document.invoices[0].to_dict() if document.invoices else None,
        "alerts": [alert.to_dict() for alert in document.alerts],
        "reports": [report.to_dict() for report in document.reports if not report.revoked_at],
        "expiry_date": iso(document.expiry_date),
        "redacted": bool(document.redacted_path),
        "artifacts": {
            "preview": bool(document.tampering and document.tampering.preview_path),
            "heatmap": bool(document.tampering and document.tampering.heatmap_path),
            "overlay": bool(document.tampering and document.tampering.overlay_path),
        },
        "progress": analysis_progress(document),
    })
    return data


def delete_document(document: Document) -> dict:
    """Secure deletion: wipe files and remove all derived personal/analysis data."""
    if document.deleted_at:
        raise DocumentError("This document is already deleted.", 410, "deleted")
    summary = {
        "checks": len(document.verification_results),
        "alerts": len(document.alerts),
        "reports": len(document.reports),
    }
    delete_document_files(document)
    db.session.execute(db.delete(SuspiciousRegion).where(SuspiciousRegion.document_id == document.id))
    db.session.execute(db.delete(VerificationResult).where(VerificationResult.document_id == document.id))
    db.session.execute(db.delete(FraudAlert).where(FraudAlert.document_id == document.id))
    db.session.execute(db.delete(VerificationReport).where(VerificationReport.document_id == document.id))
    for record in (document.ocr_result, document.tampering, document.risk_assessment,
                   document.metadata_record, document.fingerprint, *document.invoices):
        if record is not None:
            db.session.delete(record)
    document.original_filename = f"deleted-{document.id}"
    document.stored_path = ""
    document.redacted_path = None
    document.status = DOC_STATUS_DELETED
    document.status_message = "Document securely deleted."
    document.error_message = None
    document.deleted_at = utcnow()
    db.session.commit()
    log_action("document.delete", "document", document.id, summary)
    return summary
