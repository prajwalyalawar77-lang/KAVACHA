"""Privacy-first public portal engine.

All analysis is deterministic and clearly labelled as heuristic. Personal
identifiers are detected with structural checks (Verhoeff for Aadhaar, Luhn
for payment cards) and can be redacted before sharing. Redaction produces a
new image and text file; the original is never modified.
"""

import re
from pathlib import Path

from PIL import ImageDraw

from app.extensions import db
from app.modules.smart_verification.validators import luhn_valid, verhoeff_valid
from app.services.file_service import document_preview
from app.utils.text import mask_value

AADHAAR_RE = re.compile(r"(?<!\d)([2-9]\d{3})[\s\-]?(\d{4})[\s\-]?(\d{4})(?!\d)")
PAN_RE = re.compile(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b")
IFSC_RE = re.compile(r"\b[A-Z]{4}0[A-Z0-9]{6}\b")
PHONE_RE = re.compile(r"(?:\+91[\s\-]?)?([6-9]\d{9})\b")
EMAIL_RE = re.compile(r"\b([A-Za-z0-9._%+\-]+)@([A-Za-z0-9.\-]+\.[A-Za-z]{2,})\b")
CARD_RE = re.compile(r"(?<!\d)((?:\d[ \-]?){13,19})(?!\d)")
UPI_RE = re.compile(r"\b([A-Za-z0-9._\-]{2,})@(okhdfcbank|oksbi|okaxis|paytm|ybl|ibl|axl|upi|apl)\b", re.I)
ACCOUNT_RE = re.compile(r"(?:A/?C|ACCOUNT)\s*(?:NO\.?|NUMBER)?\s*[:\-]?\s*(\d{9,18})", re.I)
VOTER_RE = re.compile(r"\b([A-Z]{3}[0-9]{7})\b")
PASSPORT_RE = re.compile(r"\b([A-Z][0-9]{7})\b")

PII_TYPES = {
    "aadhaar": "Aadhaar number",
    "pan": "PAN",
    "ifsc": "IFSC",
    "account": "Bank account number",
    "phone": "Phone number",
    "email": "Email address",
    "card": "Payment card number",
    "upi": "UPI ID",
    "voter": "Voter ID",
    "passport": "Passport number",
}

PAYMENT_PATTERNS = [
    (r"registration\s+fee", "Requests a registration fee"),
    (r"security\s+deposit", "Mentions a security deposit"),
    (r"processing\s+fee", "Requests a processing fee"),
    (r"training\s+fee", "Requests a training fee"),
    (r"joining\s+fee", "Requests a joining fee"),
    (r"refundable\s+deposit", "Mentions a refundable deposit"),
    (r"pay\s+(?:rs\.?|inr|\u20b9)?\s*\d+", "Asks for a payment"),
    (r"transfer\s+(?:rs\.?|inr|\u20b9)", "Asks for a money transfer"),
    (r"gift\s+card", "Mentions gift cards"),
    (r"western\s+union", "Mentions Western Union"),
]
FREE_EMAIL_DOMAINS = {"gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "rediffmail.com", "protonmail.com", "icloud.com"}
URGENCY_PATTERNS = [r"immediate\s+joining", r"within\s+24\s+hours", r"limited\s+seats", r"urgent\s+requirement", r"act\s+now"]
CHANNEL_PATTERNS = [r"whatsapp", r"telegram", r"instagram", r"facebook\s+message"]
LINK_PATTERNS = [r"bit\.ly", r"tinyurl", r"t\.co", r"cutt\.ly"]


def _mask_by_type(pii_type: str, value: str) -> str:
    digits = re.sub(r"\D", "", value)
    if pii_type == "aadhaar" and len(digits) == 12:
        return f"XXXX XXXX {digits[-4:]}"
    if pii_type == "account":
        return mask_value(digits, 4)
    if pii_type == "card":
        return f"**** **** **** {digits[-4:]}" if len(digits) >= 4 else "****"
    if pii_type == "phone":
        return f"+91 ******{digits[-4:]}" if len(digits) >= 4 else "******"
    if pii_type == "email":
        local, _, domain = value.partition("@")
        return f"{local[:1]}***@{domain}" if local else f"***@{domain}"
    if pii_type == "upi":
        local, _, domain = value.partition("@")
        return f"{local[:1]}***@{domain}"
    if pii_type == "pan" and len(value) == 10:
        return f"*****{value[5:9]}*"
    if pii_type in ("voter", "passport") and len(value) >= 4:
        return "*" * (len(value) - 4) + value[-4:]
    if pii_type == "ifsc" and len(value) >= 4:
        return value[:4] + "0" + "***" + value[-2:]
    return mask_value(value)


def _word_join(words):
    pieces = []
    spans = []
    cursor = 0
    ordered = sorted(words, key=lambda w: (w.get("page", 1), w.get("y", 0), w.get("x", 0)))
    for word in ordered:
        text = word.get("text", "")
        if not text:
            continue
        start = cursor
        end = start + len(text)
        pieces.append(text)
        spans.append((start, end, word))
        cursor = end + 1
    return " ".join(pieces), spans


def _boxes_for_match(start: int, end: int, spans) -> list[dict]:
    boxes = []
    for span_start, span_end, word in spans:
        if span_end > start and span_start < end:
            boxes.append({
                "page": word.get("page", 1),
                "x": round(word.get("x", 0), 4),
                "y": round(word.get("y", 0), 4),
                "w": round(word.get("w", 0), 4),
                "h": round(word.get("h", 0), 4),
            })
    return boxes


def detect_pii(text: str, words: list[dict]) -> list[dict]:
    joined, spans = _word_join(words or [])
    detections = []
    seen = set()

    def add(pii_type, value, match_start, match_end, confidence=0.9, note=None):
        key = (pii_type, re.sub(r"\s+", "", value))
        if key in seen:
            return
        seen.add(key)
        detections.append({
            "type": pii_type,
            "label": PII_TYPES[pii_type],
            "masked": _mask_by_type(pii_type, value),
            "confidence": confidence,
            "boxes": _boxes_for_match(match_start, match_end, spans),
            "note": note,
        })

    for match in AADHAAR_RE.finditer(joined):
        digits = "".join(match.groups())
        if verhoeff_valid(digits):
            add("aadhaar", match.group(0), match.start(), match.end(), 0.92)
        else:
            add("aadhaar", match.group(0), match.start(), match.end(), 0.45,
                "12-digit number resembles Aadhaar but fails the Verhoeff checksum; may be OCR noise.")
    for match in PAN_RE.finditer(joined.upper()):
        add("pan", match.group(0), match.start(), match.end(), 0.9)
    for match in IFSC_RE.finditer(joined.upper()):
        add("ifsc", match.group(0), match.start(), match.end(), 0.85)
    for match in PHONE_RE.finditer(joined):
        add("phone", match.group(0), match.start(), match.end(), 0.7)
    for match in EMAIL_RE.finditer(joined):
        add("email", match.group(0), match.start(), match.end(), 0.88)
    for match in CARD_RE.finditer(joined):
        digits = re.sub(r"\D", "", match.group(0))
        if 13 <= len(digits) <= 19 and luhn_valid(digits):
            add("card", match.group(0), match.start(), match.end(), 0.88)
    for match in UPI_RE.finditer(joined):
        add("upi", match.group(0), match.start(), match.end(), 0.8)
    for match in ACCOUNT_RE.finditer(joined):
        add("account", match.group(1), match.start(1), match.end(1), 0.8)
    if re.search(r"voter|elector", joined, re.I):
        for match in VOTER_RE.finditer(joined.upper()):
            add("voter", match.group(0), match.start(), match.end(), 0.6)
    if re.search(r"passport", joined, re.I):
        for match in PASSPORT_RE.finditer(joined.upper()):
            add("passport", match.group(0), match.start(), match.end(), 0.6)
    return detections


PAN_ANY_RE = re.compile(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b", re.IGNORECASE)
IFSC_ANY_RE = re.compile(r"\b[A-Z]{4}0[A-Z0-9]{6}\b", re.IGNORECASE)


def redact_text(text: str, detections: list[dict]) -> str:
    redacted = text or ""

    def _sub_aadhaar(match):
        digits = "".join(match.groups())
        return f"XXXX XXXX {digits[-4:]}"

    redacted = AADHAAR_RE.sub(_sub_aadhaar, redacted)
    redacted = PAN_ANY_RE.sub(lambda m: f"*****{m.group(0)[5:9]}*", redacted)
    redacted = EMAIL_RE.sub(lambda m: f"{m.group(1)[:1]}***@{m.group(2)}", redacted)
    redacted = UPI_RE.sub(lambda m: f"{m.group(1)[:1]}***@{m.group(2)}", redacted)
    redacted = PHONE_RE.sub(lambda m: f"+91 ******{m.group(1)[-4:]}", redacted)
    redacted = IFSC_ANY_RE.sub(lambda m: m.group(0)[:4] + "0***" + m.group(0)[-2:], redacted)

    def _sub_card(match):
        digits = re.sub(r"\D", "", match.group(0))
        return f"**** **** **** {digits[-4:]}" if digits else match.group(0)

    redacted = CARD_RE.sub(lambda m: _sub_card(m) if luhn_valid(re.sub(r"\D", "", m.group(0))) else m.group(0), redacted)
    redacted = ACCOUNT_RE.sub(lambda m: "ACCOUNT " + mask_value(m.group(1), 4), redacted)
    return redacted


def redact_document(document, detections: list[dict]) -> dict:
    from flask import current_app

    folder = Path(current_app.config["REDACTED_FOLDER"]) / document.uuid
    folder.mkdir(parents=True, exist_ok=True)
    image_path = folder / "redacted.png"
    text_path = folder / "redacted.txt"

    image = document_preview(document)
    draw = ImageDraw.Draw(image)
    width, height = image.size
    page1 = [d for d in detections if any(box.get("page", 1) == 1 for box in d["boxes"])]
    for detection in page1:
        for box in detection["boxes"]:
            if box.get("page", 1) != 1:
                continue
            x0 = max(0, int(box["x"] * width) - 3)
            y0 = max(0, int(box["y"] * height) - 3)
            x1 = min(width, int((box["x"] + box["w"]) * width) + 3)
            y1 = min(height, int((box["y"] + box["h"]) * height) + 3)
            if x1 > x0 and y1 > y0:
                draw.rectangle([x0, y0, x1, y1], fill="black")
    image.save(image_path, format="PNG")
    from app.models import OCRResult

    ocr = OCRResult.query.filter_by(document_id=document.id).first()
    redacted_text = redact_text(ocr.text if ocr else "", detections)
    text_path.write_text(redacted_text, encoding="utf-8")
    relative = (Path("redacted") / document.uuid / "redacted.png").as_posix()
    document.redacted_path = relative
    return {
        "image_path": relative,
        "text_path": (Path("redacted") / document.uuid / "redacted.txt").as_posix(),
        "redacted_text": redacted_text,
        "detection_count": len(detections),
    }


def _scan_patterns(text: str, patterns: list, label: str) -> list[dict]:
    hits = []
    upper = text or ""
    for pattern, description in patterns:
        for match in re.finditer(pattern, upper, re.I):
            raw = match.group(0)
            snippet = _snippet(upper, match.start(), match.end())
            if raw.strip() and snippet not in [h["snippet"] for h in hits]:
                hits.append({
                    "pattern": pattern,
                    "description": description or label,
                    "snippet": snippet,
                })
            break
    return hits


def _snippet(text: str, start: int, end: int, radius=55) -> str:
    left = max(0, start - radius)
    right = min(len(text), end + radius)
    return re.sub(r"\s+", " ", text[left:right]).strip()


def run_public_checks(document, text: str, fields: dict, pii_detections: list[dict]) -> list[dict]:
    checks = []
    upper = (text or "").upper()

    payment_hits = _scan_patterns(text, PAYMENT_PATTERNS, "Payment demand")
    if payment_hits:
        checks.append({
            "code": "public_upfront_payment",
            "name": "Upfront payment request",
            "category": "public_safety",
            "status": "warning",
            "severity": "high",
            "message": "This document contains language asking for payment or deposits. "
                       "Never pay a fee to obtain a job, certificate, rental or refund. "
                       "Verify the organisation through independent channels.",
            "expected": "No upfront payment request",
            "actual": f"{len(payment_hits)} matching phrase(s)",
            "details": {"hits": payment_hits[:4]},
        })
    else:
        checks.append({
            "code": "public_upfront_payment",
            "name": "Upfront payment request",
            "category": "public_safety",
            "status": "passed",
            "severity": "low",
            "message": "No common upfront-payment phrases were detected. This is a keyword check, not a guarantee.",
            "details": {"hits": []},
        })

    free_emails = [email for email in fields.get("emails", [])
                   if email.split("@")[-1].lower() in FREE_EMAIL_DOMAINS]
    if document.doc_kind in ("offer_letter", "salary_slip", "rental_agreement") and free_emails:
        checks.append({
            "code": "public_free_email",
            "name": "Contact uses a free email domain",
            "category": "public_safety",
            "status": "warning",
            "severity": "medium",
            "message": "The document references a free email provider rather than a corporate domain. "
                       "Legitimate smaller firms sometimes do this, so confirm independently.",
            "actual": ", ".join(free_emails[:3]),
            "details": {"emails": free_emails[:3]},
        })
    else:
        checks.append({
            "code": "public_free_email",
            "name": "Contact uses a free email domain",
            "category": "public_safety",
            "status": "skipped",
            "severity": "info",
            "message": "No free email domain contact was detected, or the check does not apply.",
        })

    urgency_hits = _scan_patterns(text, [(p, "Urgency or pressure language") for p in URGENCY_PATTERNS], "Urgency")
    if urgency_hits:
        checks.append({
            "code": "public_urgency_pressure",
            "name": "Urgency or pressure language",
            "category": "public_safety",
            "status": "warning",
            "severity": "low",
            "message": "Phrases that create urgency were detected. Pressure tactics are sometimes used in scams, "
                       "but also appear in ordinary recruiting.",
            "actual": f"{len(urgency_hits)} phrase(s)",
            "details": {"hits": urgency_hits[:4]},
        })

    channel_hits = _scan_patterns(text, [(p, "Informal contact channel") for p in CHANNEL_PATTERNS], "Channel")
    link_hits = _scan_patterns(text, [(p, "Shortened link") for p in LINK_PATTERNS], "Short link")
    if channel_hits or link_hits:
        checks.append({
            "code": "public_suspicious_links",
            "name": "Informal channel or shortened link",
            "category": "public_safety",
            "status": "warning",
            "severity": "medium",
            "message": "The document mentions informal messaging channels or shortened links. "
                       "Do not click unknown links or share OTPs/passwords.",
            "actual": f"{len(channel_hits) + len(link_hits)} indicator(s)",
            "details": {"channels": channel_hits[:3], "links": link_hits[:3]},
        })

    if pii_detections:
        types = sorted({PII_TYPES.get(d["type"], d["type"]) for d in pii_detections})
        checks.append({
            "code": "public_pii_exposure",
            "name": "Personal identifiers present",
            "category": "public_safety",
            "status": "warning",
            "severity": "low",
            "message": f"This document contains {len(pii_detections)} detected personal identifier(s): "
                       f"{', '.join(types)}. Use the redaction tool before sharing.",
            "actual": f"{len(pii_detections)} identifier(s)",
            "details": {"types": types, "count": len(pii_detections)},
        })
    return checks
