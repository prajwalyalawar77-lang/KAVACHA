import html
import secrets
from datetime import timedelta
from pathlib import Path

import qrcode
from flask import current_app
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.constants import DISCLAIMER
from app.extensions import db
from app.models import VerificationReport
from app.utils.text import mask_value
from app.utils.time import iso, utcnow

CATEGORY_COLORS = {
    "low": colors.HexColor("#16a34a"),
    "medium": colors.HexColor("#f59e0b"),
    "high": colors.HexColor("#f97316"),
    "critical": colors.HexColor("#dc2626"),
}
CATEGORY_HEX = {"low": "#16a34a", "medium": "#f59e0b", "high": "#f97316", "critical": "#dc2626"}
STATUS_COLORS = {
    "passed": colors.HexColor("#16a34a"),
    "failed": colors.HexColor("#dc2626"),
    "warning": colors.HexColor("#f59e0b"),
    "skipped": colors.HexColor("#64748b"),
    "unverified": colors.HexColor("#0ea5e9"),
}


def _safe(text) -> str:
    if text is None:
        return ""
    value = str(text)
    for old, new in (("\u20b9", "INR "), ("\u2013", "-"), ("\u2014", "-"), ("\u2022", "*"),
                     ("\u00d7", "x"), ("\u2264", "<="), ("\u2265", ">="), ("\u2026", "...")):
        value = value.replace(old, new)
    return html.escape(value).replace("\n", "<br/>")


def _styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("KTitle", parent=base["Title"], fontName="Helvetica-Bold",
                                fontSize=22, textColor=colors.HexColor("#0b1220"), spaceAfter=2),
        "subtitle": ParagraphStyle("KSub", parent=base["Normal"], fontName="Helvetica",
                                   fontSize=9, textColor=colors.HexColor("#475569"), alignment=TA_LEFT),
        "h2": ParagraphStyle("KH2", parent=base["Heading2"], fontName="Helvetica-Bold",
                             fontSize=12, textColor=colors.HexColor("#0e7490"), spaceBefore=12, spaceAfter=4),
        "body": ParagraphStyle("KBody", parent=base["BodyText"], fontName="Helvetica", fontSize=8.5,
                               leading=11.5, textColor=colors.HexColor("#1e293b")),
        "small": ParagraphStyle("KSmall", parent=base["BodyText"], fontName="Helvetica", fontSize=7.5,
                                leading=9.5, textColor=colors.HexColor("#475569")),
        "cell": ParagraphStyle("KCell", parent=base["BodyText"], fontName="Helvetica", fontSize=7.6, leading=9.4),
        "cellbold": ParagraphStyle("KCellB", parent=base["BodyText"], fontName="Helvetica-Bold",
                                   fontSize=7.6, leading=9.4),
        "score": ParagraphStyle("KScore", parent=base["Title"], fontName="Helvetica-Bold",
                                fontSize=34, alignment=TA_CENTER, textColor=colors.HexColor("#0b1220")),
        "disclaimer": ParagraphStyle("KDisc", parent=base["BodyText"], fontName="Helvetica", fontSize=7.2,
                                     leading=9.2, textColor=colors.HexColor("#334155")),
    }


def _qr_image(url: str, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=8, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    image = qr.make_image(fill_color="#0b1220", back_color="white").convert("RGB")
    image.save(path, format="PNG")
    return path


def _kv_table(rows, styles, widths=(42 * mm, 128 * mm)):
    data = [[Paragraph(f"<b>{_safe(k)}</b>", styles["cell"]), Paragraph(_safe(v), styles["cell"])] for k, v in rows]
    table = Table(data, colWidths=list(widths))
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f1f5f9")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#e2e8f0")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return table


def _check_value(check, key, default=""):
    if isinstance(check, dict):
        return check.get(key, default)
    return getattr(check, "check_name" if key == "name" else key, default)


def _checks_table(checks, styles):
    header = [Paragraph("<b>Check</b>", styles["cellbold"]),
              Paragraph("<b>Status</b>", styles["cellbold"]),
              Paragraph("<b>Finding</b>", styles["cellbold"])]
    data = [header]
    for check in checks:
        data.append([
            Paragraph(_safe(_check_value(check, "name")), styles["cell"]),
            Paragraph(f"<b>{_safe(str(_check_value(check, 'status')).upper())}</b>", styles["cell"]),
            Paragraph(_safe(_check_value(check, "message")), styles["cell"]),
        ])
    table = Table(data, colWidths=(45 * mm, 20 * mm, 105 * mm), repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#e2e8f0")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    for index, check in enumerate(checks, start=1):
        style.append(("BACKGROUND", (0, index), (0, index), colors.HexColor("#f8fafc")))
        style.append(("TEXTCOLOR", (1, index), (1, index),
                      STATUS_COLORS.get(_check_value(check, "status"), colors.black)))
    table.setStyle(TableStyle(style))
    return table


def _forensic_rows(tampering, styles):
    if not tampering:
        return None
    header = [Paragraph("<b>Indicator</b>", styles["cellbold"]),
              Paragraph("<b>Severity</b>", styles["cellbold"]),
              Paragraph("<b>Evidence</b>", styles["cellbold"])]
    data = [header]
    for indicator in tampering.indicators_json or []:
        data.append([
            Paragraph(_safe(indicator.get("label")), styles["cell"]),
            Paragraph(_safe(indicator.get("severity", "")).upper(), styles["cell"]),
            Paragraph(_safe(indicator.get("detail")), styles["cell"]),
        ])
    if len(data) == 1:
        return None
    table = Table(data, colWidths=(45 * mm, 20 * mm, 105 * mm), repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#e2e8f0")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return table


def _footer(canvas, doc, token):
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#64748b"))
    canvas.drawString(18 * mm, 10 * mm,
                      "KAVACHA - Document Trust & Fraud Intelligence. Automated findings are indicators, not proof of forgery.")
    canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Report {token[:12]}... | Page {doc.page}")
    canvas.restoreState()


def _money(value):
    if value is None:
        return "-"
    try:
        return f"INR {float(value):,.2f}"
    except (TypeError, ValueError):
        return str(value)


def build_pdf(document, report, risk, checks, tampering, metadata, fields, org_name, owner_name, qr_path, out_path):
    styles = _styles()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(out_path), pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=18 * mm,
        title=f"KAVACHA Verification Report {report.report_token[:12]}",
        author="KAVACHA", subject="Document verification report",
    )
    story = []
    category = risk["category"]
    category_hex = CATEGORY_HEX.get(category, "#475569")

    header_table = Table([[
        [Paragraph("KAVACHA", styles["title"]),
         Paragraph("Document Trust &amp; Fraud Intelligence | One Document. Multiple Checks. Complete Trust.",
                   styles["subtitle"])],
        [Paragraph("<b>VERIFICATION REPORT</b>", styles["subtitle"]),
         Paragraph(f"Report: {_safe(report.report_token[:22])}...", styles["small"]),
         Paragraph(f"Generated: {_safe(iso(report.created_at))}", styles["small"]),
         Paragraph(f"Valid until: {_safe(iso(report.expires_at))}", styles["small"])],
    ]], colWidths=(112 * mm, 58 * mm))
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(header_table)
    story.append(HRFlowable(width="100%", thickness=1.2, color=colors.HexColor("#0891b2")))
    story.append(Spacer(1, 6 * mm))

    score_value = risk["score"]
    counts = risk["counts"]
    score_rows = [
        [Paragraph(f'<font size="30" color="{category_hex}"><b>{score_value:.0f}</b></font><font size="10">/100</font>', styles["score"]),
         Paragraph("<b>Risk category</b><br/>" + f'<font color="{category_hex}"><b>{category.upper()}</b></font>', styles["body"]),
         Paragraph("<b>Verification confidence</b><br/>" + f"{risk['confidence'] * 100:.0f}%", styles["body"]),
         Image(str(qr_path), width=28 * mm, height=28 * mm)],
        [Paragraph(f"Passed: <b>{counts.get('passed', 0)}</b> | Failed: <b>{counts.get('failed', 0)}</b> | "
                   f"Warnings: <b>{counts.get('warning', 0)}</b> | Skipped: <b>{counts.get('skipped', 0)}</b> | "
                   f"Unverified: <b>{counts.get('unverified', 0)}</b>", styles["small"]),
         Paragraph(f"<b>Document DNA (SHA-256)</b><br/><font size=\"6.5\">{_safe(document.sha256)}</font>", styles["small"]),
         Paragraph("<b>QR verification</b><br/>Links to a secure summary. The QR code is not proof of authenticity.", styles["small"]),
         Paragraph("", styles["small"])],
    ]
    score_table = Table(score_rows, colWidths=(35 * mm, 45 * mm, 55 * mm, 35 * mm))
    score_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#cbd5e1")),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("SPAN", (1, 1), (2, 1)),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(score_table)
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph(_safe(risk["summary"]), styles["body"]))

    story.append(Paragraph("Document &amp; submission", styles["h2"]))
    story.append(_kv_table([
        ("File name", document.original_filename),
        ("Document type", document.doc_kind.replace("_", " ").title()),
        ("Portal", document.portal.title()),
        ("Owner", owner_name or "-"),
        ("Organisation", org_name or "-"),
        ("Uploaded", iso(document.created_at)),
        ("Pages analysed / total", f"{tampering.analysis_pages if tampering else 0} / {document.page_count or '-'}"),
        ("OCR", f"{document.ocr_result.engine if document.ocr_result else '-'} | mean confidence: "
                f"{(document.ocr_result.mean_confidence * 100) if document.ocr_result and document.ocr_result.mean_confidence is not None else 'n/a'}"),
        ("Perceptual fingerprint (dHash)", document.fingerprint.dhash if document.fingerprint else "-"),
    ], styles))

    story.append(Paragraph("Verification checks", styles["h2"]))
    story.append(_checks_table(checks, styles))

    forensic_table = _forensic_rows(tampering, styles)
    if forensic_table is not None:
        story.append(Paragraph("Forensic indicators (visual analysis of page 1)", styles["h2"]))
        story.append(forensic_table)
        regions = tampering.regions if tampering else []
        if regions:
            story.append(Spacer(1, 2 * mm))
            story.append(Paragraph(
                f"<b>{len(regions)} suspicious region(s)</b> were highlighted. Coordinates are normalised "
                "to the page and shown in the forensic viewer. Regions are indicators for manual inspection.", styles["small"]))

    if metadata:
        story.append(Paragraph("Document metadata", styles["h2"]))
        story.append(_kv_table([
            ("Producer", metadata.producer or "-"),
            ("Creator", metadata.creator or "-"),
            ("Author", metadata.author or "-"),
            ("PDF version", metadata.pdf_version or "-"),
            ("Created (as reported)", metadata.creation_date or "-"),
            ("Modified (as reported)", metadata.modification_date or "-"),
            ("Digital signature", "Detected" if metadata.has_signature else "Not detected"),
            ("Incremental updates", metadata.incremental_updates or 0),
        ], styles))

    if fields:
        amounts = fields.get("amounts") or {}
        story.append(Paragraph("Extracted information", styles["h2"]))
        story.append(_kv_table([
            ("Vendor / issuer", fields.get("vendor_name") or "-"),
            ("Buyer", fields.get("buyer_name") or "-"),
            ("GSTIN (format/checksum checked)", fields.get("gstin") or "-"),
            ("Invoice number", fields.get("invoice_number") or "-"),
            ("Invoice date", fields.get("invoice_date") or "-"),
            ("Taxable value", _money(amounts.get("taxable"))),
            ("Tax", _money(amounts.get("tax_total"))),
            ("Total", _money(amounts.get("total"))),
            ("Bank account", mask_value(fields.get("bank_account"), 4) if fields.get("bank_account") else "-"),
            ("IFSC", fields.get("ifsc") or "-"),
        ], styles))
        story.append(Paragraph(
            "Extraction is OCR/layout-based and may miss fields. Blank values mean 'not detected', not 'not present'.",
            styles["small"]))

    story.append(Paragraph("Recommendations", styles["h2"]))
    for item in risk["recommendations"]:
        story.append(Paragraph(f"- {_safe(item)}", styles["body"]))

    story.append(Spacer(1, 4 * mm))
    disclaimer_table = Table([[Paragraph(
        f"<b>Important limitations.</b> {_safe(DISCLAIMER)} "
        f"Risk thresholds: 0-{risk['thresholds']['medium']} low, "
        f"{risk['thresholds']['medium'] + 1}-{risk['thresholds']['high']} medium, "
        f"{risk['thresholds']['high'] + 1}-{risk['thresholds']['critical']} high, "
        f"{risk['thresholds']['critical'] + 1}-100 critical (configurable). "
        "This report is a link-verifiable summary; it is not an authenticity certificate and does not establish fraud.",
        styles["disclaimer"])]], colWidths=(170 * mm))
    disclaimer_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#f59e0b")),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fffbeb")),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(disclaimer_table)

    doc.build(story, onFirstPage=lambda c, d: _footer(c, d, report.report_token),
              onLaterPages=lambda c, d: _footer(c, d, report.report_token))
    return out_path


def create_report(document, user, base_url: str | None = None) -> VerificationReport:
    risk_model = document.risk_assessment
    if not risk_model:
        raise ValueError("Run document analysis before generating a report.")
    token = secrets.token_urlsafe(24)
    folder = Path(current_app.config["REPORT_FOLDER"]) / document.uuid
    folder.mkdir(parents=True, exist_ok=True)
    qr_path = folder / f"{token}.qr.png"
    pdf_path = folder / f"{token}.pdf"
    base = (base_url or current_app.config["QR_BASE_URL"]).rstrip("/")
    url = f"{base}/{token}"
    _qr_image(url, qr_path)

    expires_at = utcnow() + timedelta(days=current_app.config["REPORT_EXPIRY_DAYS"])
    report = VerificationReport(
        document_id=document.id,
        report_token=token,
        qr_path=(Path("reports") / document.uuid / qr_path.name).as_posix(),
        pdf_path=(Path("reports") / document.uuid / pdf_path.name).as_posix(),
        expires_at=expires_at,
        created_by_id=getattr(user, "id", None),
    )
    db.session.add(report)
    db.session.flush()

    risk = risk_model.to_dict()
    checks = [check.to_dict() for check in document.verification_results]
    fields = document.ocr_result.fields_json if document.ocr_result else {}
    metadata = document.metadata_record
    org_name = document.organisation.name if document.organisation else None
    build_pdf(
        document, report, risk, checks, document.tampering, metadata, fields,
        org_name, document.owner.full_name if document.owner else None, qr_path, pdf_path,
    )
    return report


def public_report_payload(report: VerificationReport) -> dict:
    if report.revoked_at:
        return {"valid": False, "reason": "This verification link was revoked by the document owner."}
    if report.expires_at and report.expires_at < utcnow():
        return {"valid": False, "reason": "This verification link has expired."}
    document = report.document
    if not document or document.deleted_at or not document.risk_assessment:
        return {"valid": False, "reason": "The underlying document is no longer available."}
    risk = document.risk_assessment
    checks = [{
        "name": check.check_name,
        "status": check.status,
        "severity": check.severity,
        "category": check.category,
    } for check in document.verification_results]
    return {
        "valid": True,
        "report_token": report.report_token,
        "created_at": iso(report.created_at),
        "expires_at": iso(report.expires_at),
        "document": {
            "kind": document.doc_kind.replace("_", " ").title(),
            "portal": document.portal,
            "analysed_at": iso(document.updated_at),
            "dna_prefix": (document.sha256 or "")[:16],
        },
        "risk": {
            "score": risk.score,
            "category": risk.category,
            "confidence": risk.confidence,
            "counts": {
                "passed": risk.passed_count, "failed": risk.failed_count,
                "warning": risk.warning_count, "skipped": risk.skipped_count,
            },
            "summary": risk.summary,
        },
        "checks": checks,
        "disclaimer": DISCLAIMER,
        "notice": "This public summary intentionally excludes the document image, extracted personal data and owner identity. "
                  "A verification link is not proof of authenticity and can be revoked at any time.",
    }
