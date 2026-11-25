"""Verification reports, QR links and the public verification page payload."""

from flask import Blueprint, current_app, g, send_file

from app.extensions import db
from app.models import Document, VerificationReport
from app.routes.deps import get_document, json_body, paginate
from app.services.audit_service import log_action
from app.services.document_service import DocumentError
from app.services.report_service import create_report, public_report_payload
from app.utils.files import resolve_storage_path
from app.utils.limiter import rate_limit
from app.utils.responses import created, err, ok, pagination_meta
from app.utils.security import auth_required
from app.utils.time import utcnow

bp = Blueprint("reports", __name__, url_prefix="/api/reports")


def _get_report(report_id: int) -> VerificationReport:
    report = db.session.get(VerificationReport, report_id)
    if not report or not report.document:
        raise DocumentError("Report not found.", 404, "not_found")
    document = report.document
    user = g.current_user
    allowed = user.role == "admin" or document.owner_id == user.id
    if not allowed and user.role == "industrial" and user.organisation_id == document.organisation_id:
        allowed = True
    if not allowed or document.deleted_at:
        raise DocumentError("Report not found.", 404, "not_found")
    return report


def _share_url(token: str) -> str:
    return f"{current_app.config['QR_BASE_URL'].rstrip('/')}/{token}"


@bp.post("")
@auth_required
def generate_report():
    payload = json_body()
    document_id = payload.get("document_id")
    try:
        document = get_document(int(document_id), g.current_user)
    except (TypeError, ValueError):
        raise DocumentError("Choose a document to generate a report for.", 422, "document_required")
    if not document.risk_assessment:
        return err("Analyse the document before generating a verification report.", 422, "not_analysed")
    base_url = payload.get("base_url") or current_app.config["QR_BASE_URL"]
    try:
        report = create_report(document, g.current_user, base_url)
    except ValueError as exc:
        return err(str(exc), 422, "not_analysed")
    db.session.commit()
    log_action("report.create", "verification_report", report.id, {"document_id": document.id})
    db.session.commit()
    return created({
        "report": report.to_dict(),
        "document": document.to_dict(),
        "share_url": f"{base_url.rstrip('/')}/{report.report_token}",
        "download_url": f"/api/reports/{report.id}/download",
        "qr_url": f"/api/reports/{report.id}/qr",
        "notice": "The QR code links to a time-limited verification summary. It is not proof of authenticity "
                  "and can be revoked by the document owner.",
    })


@bp.get("")
@auth_required
def list_reports():
    user = g.current_user
    stmt = db.select(VerificationReport).join(Document, VerificationReport.document_id == Document.id).where(
        Document.deleted_at.is_(None)
    )
    if user.role == "industrial" and user.organisation_id:
        stmt = stmt.where(db.or_(Document.organisation_id == user.organisation_id,
                                 Document.owner_id == user.id))
    elif user.role != "admin":
        stmt = stmt.where(Document.owner_id == user.id)
    stmt = stmt.order_by(VerificationReport.created_at.desc())
    rows, total, page, per_page = paginate(stmt, default_per_page=15)
    return ok({
        "reports": [
            {
                **report.to_dict(),
                "document_name": report.document.original_filename,
                "document_id": report.document_id,
                "category": report.document.risk_assessment.category if report.document.risk_assessment else None,
                "score": report.document.risk_assessment.score if report.document.risk_assessment else None,
                "share_url": _share_url(report.report_token),
            }
            for report in rows
        ],
    }, meta=pagination_meta(total, page, per_page))


@bp.get("/<int:report_id>")
@auth_required
def report_detail(report_id: int):
    report = _get_report(report_id)
    payload = public_report_payload(report)
    return ok({
        "report": {**report.to_dict(), "document_name": report.document.original_filename},
        "share_url": _share_url(report.report_token),
        "preview": payload,
    })


@bp.get("/<int:report_id>/download")
@auth_required
def download_report(report_id: int):
    report = _get_report(report_id)
    path = resolve_storage_path(report.pdf_path)
    if not path or not path.exists():
        raise DocumentError("The report PDF is missing. Generate a new report.", 404, "missing_report")
    log_action("report.download", "verification_report", report.id)
    db.session.commit()
    return send_file(path, mimetype="application/pdf", as_attachment=True,
                     download_name=f"kavacha-report-{report.report_token[:8]}.pdf", max_age=0)


@bp.get("/<int:report_id>/qr")
@auth_required
def report_qr(report_id: int):
    report = _get_report(report_id)
    path = resolve_storage_path(report.qr_path)
    if not path or not path.exists():
        raise DocumentError("The QR image is missing.", 404, "missing_report")
    return send_file(path, mimetype="image/png", max_age=0)


@bp.post("/<int:report_id>/revoke")
@auth_required
def revoke_report(report_id: int):
    report = _get_report(report_id)
    user = g.current_user
    if user.role != "admin" and report.document.owner_id != user.id:
        raise DocumentError("Only the document owner can revoke this link.", 403, "forbidden")
    if not report.revoked_at:
        report.revoked_at = utcnow()
        db.session.commit()
        log_action("report.revoke", "verification_report", report.id)
        db.session.commit()
    return ok({"report": report.to_dict(), "message": "The public verification link is now revoked."})


@bp.get("/public/<token>")
@rate_limit(90, 60, "reports.public")
def public_verify(token: str):
    if not token or len(token) > 80:
        return err("Invalid verification link.", 404, "not_found")
    report = db.session.scalar(
        db.select(VerificationReport).where(VerificationReport.report_token == token)
    )
    if not report:
        return err("This verification link is not recognised.", 404, "not_found")
    payload = public_report_payload(report)
    if not payload.get("valid"):
        return ok(payload, meta={"valid": False})
    return ok(payload)
