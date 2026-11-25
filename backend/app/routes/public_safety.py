"""Public safety portal: PII review, redaction, suspicious-document reporting."""

from flask import Blueprint, current_app, g, send_file

from app.constants import DISCLAIMER
from app.extensions import db
from app.models import Document, FraudAlert, Notification, User
from app.modules.public_safety.engine import detect_pii, redact_document
from app.routes.deps import get_document, json_body
from app.services.audit_service import log_action
from app.utils.responses import created, err, ok
from app.utils.security import auth_required
from app.utils.time import iso, utcnow
from app.utils.validation import parse_int

bp = Blueprint("public_safety", __name__, url_prefix="/api/public")

SAFETY_TIPS = [
    "Never pay a deposit or 'processing fee' to receive a job, certificate, refund or rental.",
    "Verify the organisation using an independent phone number or website — not the one in the document.",
    "Be cautious of urgency, WhatsApp-only contact and shortened links.",
    "Redact Aadhaar, PAN, account numbers and phone numbers before sharing a document.",
    "Download the KAVACHA report and compare identifiers with original sources.",
]


def _assert_owner(document: Document):
    user = g.current_user
    if user.role != "admin" and document.owner_id != user.id:
        from app.services.document_service import DocumentError

        raise DocumentError("Only the document owner can perform this action.", 403, "forbidden")


@bp.get("/overview")
@auth_required
def overview():
    user = g.current_user
    stmt = db.select(Document).where(Document.deleted_at.is_(None), Document.owner_id == user.id)
    documents = db.session.scalars(stmt.order_by(Document.created_at.desc()).limit(50)).all()
    risk_counts = {"low": 0, "medium": 0, "high": 0, "critical": 0, "unassessed": 0}
    for document in documents:
        assessment = document.risk_assessment
        if assessment:
            risk_counts[assessment.category] = risk_counts.get(assessment.category, 0) + 1
        else:
            risk_counts["unassessed"] += 1
    alert_count = db.session.scalar(
        db.select(db.func.count()).select_from(FraudAlert)
        .join(Document, FraudAlert.document_id == Document.id)
        .where(Document.owner_id == user.id, FraudAlert.status == "open")
    )
    return ok({
        "counts": {
            "documents": len(documents),
            "analysed": sum(1 for d in documents if d.status == "analysed"),
            "redacted_copies": sum(1 for d in documents if d.redacted_path),
            "open_alerts": alert_count or 0,
        },
        "risk_distribution": risk_counts,
        "recent_documents": [d.to_dict() for d in documents[:5]],
        "safety_tips": SAFETY_TIPS,
        "retention_days": user.retention_days,
        "privacy": [
            "Your documents are only accessible to your account and platform administrators for support.",
            "Uploaded files are never executed and are served only through authenticated endpoints.",
            "Deleting a document wipes the stored file, previews, OCR text and derived analysis.",
        ],
        "disclaimer": DISCLAIMER,
    })


@bp.get("/documents/<int:document_id>/pii")
@auth_required
def pii_scan(document_id: int):
    document = get_document(document_id, g.current_user)
    if not document.ocr_result:
        return err("Analyse the document before scanning for personal information.", 422, "not_analysed")
    detections = detect_pii(document.ocr_result.text or "", _words(document))
    return ok({
        "document": document.to_dict(),
        "detections": detections,
        "count": len(detections),
        "note": "Detection is pattern-based (Aadhaar checksum, PAN, IFSC, card Luhn, phone/email patterns). "
                "False positives and misses are possible; review before sharing.",
    })


def _words(document):
    import json

    try:
        return json.loads(document.ocr_result.words_json or "[]")
    except (TypeError, ValueError):
        return []


@bp.post("/documents/<int:document_id>/redact")
@auth_required
def redact(document_id: int):
    document = get_document(document_id, g.current_user)
    _assert_owner(document)
    if not document.ocr_result:
        return err("Analyse the document before redacting it.", 422, "not_analysed")
    payload = json_body()
    detections = detect_pii(document.ocr_result.text or "", _words(document))
    wanted = payload.get("types")
    if isinstance(wanted, list) and wanted:
        detections = [d for d in detections if d["type"] in set(wanted)]
    if not detections:
        return err("No selected personal-information types were detected to redact.", 422, "nothing_to_redact")
    result = redact_document(document, detections)
    db.session.commit()
    log_action("public.redact", "document", document.id, {"detections": len(detections)})
    db.session.commit()
    return ok({
        "document": document.to_dict(),
        "detection_count": result["detection_count"],
        "detections": [{k: v for k, v in d.items() if k != "boxes"} for d in detections],
        "redacted_text": result["redacted_text"],
        "preview_url": f"/api/documents/{document.id}/preview?variant=redacted",
        "download_url": f"/api/public/documents/{document.id}/redacted-text",
        "note": "The redacted copy is a page-1 image with detected regions blacked out. "
                "Always verify that all sensitive data is covered before sharing.",
    })


@bp.get("/documents/<int:document_id>/redacted-text")
@auth_required
def redacted_text(document_id: int):
    document = get_document(document_id, g.current_user)
    _assert_owner(document)
    if not document.redacted_path:
        return err("No redacted copy exists yet.", 404, "not_found")
    path = current_app.config["REDACTED_FOLDER"] / document.uuid / "redacted.txt"
    if not path.exists():
        return err("The redacted text file is missing.", 404, "not_found")
    return send_file(path, mimetype="text/plain", as_attachment=True,
                     download_name=f"kavacha-redacted-{document.id}.txt", max_age=0)


@bp.post("/reports")
@auth_required
def submit_report():
    payload = json_body()
    document_id = parse_int(payload.get("document_id"))
    if not document_id:
        return err("Choose the document you want to report.", 422, "document_required")
    document = get_document(document_id, g.current_user)
    reason = (payload.get("reason") or "Suspicious document").strip()[:120]
    description = (payload.get("description") or "").strip()[:2000]
    alert = FraudAlert(
        organisation_id=document.organisation_id,
        document_id=document.id,
        alert_type="user_report",
        severity="medium",
        title=f"Suspicious document reported: {reason}"[:255],
        description=description or "The document owner flagged this document as suspicious.",
        evidence_json={
            "reason": reason,
            "reported_by": g.current_user.email,
            "reported_at": iso(utcnow()),
            "document_sha256": document.sha256,
        },
        status="open",
    )
    db.session.add(alert)
    db.session.flush()
    admins = db.session.scalars(db.select(User).where(User.role == "admin", User.is_active.is_(True))).all()
    for admin in admins:
        db.session.add(Notification(
            user_id=admin.id,
            kind="user_report",
            severity="medium",
            title="Suspicious document reported",
            message=f"{reason} — see the fraud intelligence queue.",
            link="/app/fraud-intelligence",
        ))
    db.session.commit()
    log_action("public.report", "fraud_alert", alert.id, {"document_id": document.id, "reason": reason})
    db.session.commit()
    return created({
        "alert": alert.to_dict(),
        "message": "Thank you. The report has been added to the review queue. "
                   "KAVACHA does not publish personal documents.",
    })


@bp.get("/reports")
@auth_required
def my_reports():
    user = g.current_user
    stmt = db.select(FraudAlert).join(Document, FraudAlert.document_id == Document.id).where(
        FraudAlert.alert_type == "user_report",
    )
    if user.role != "admin":
        stmt = stmt.where(Document.owner_id == user.id)
    rows = db.session.scalars(stmt.order_by(FraudAlert.created_at.desc()).limit(50)).all()
    return ok({"reports": [row.to_dict() for row in rows]})
