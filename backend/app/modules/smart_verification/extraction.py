"""Regex + layout heuristics for extracting verifiable fields from OCR text.

Extraction is deterministic and explainable. Every field records how it was
obtained so users can see why a check passed, failed or was skipped.
"""

import re
from datetime import date

from app.modules.smart_verification.validators import IFSC_RE, PAN_RE
from app.utils.text import normalize_invoice_number, parse_amount
from app.utils.time import parse_date

AMOUNT_NUM = r"(?:Rs\.?|INR|\u20b9)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)"
DATE_PATTERN = (
    r"([0-9]{1,2}[\/\.\-][0-9]{1,2}[\/\.\-][0-9]{2,4}"
    r"|[0-9]{4}-[0-9]{2}-[0-9]{2}"
    r"|[0-9]{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+[0-9]{2,4}"
    r"|[0-9]{1,2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\.?\s+[0-9]{2,4})"
)
GSTIN_GLOBAL_RE = re.compile(r"\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b")
EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b")
PHONE_RE = re.compile(r"(?:\+91[\s\-]?)?[6-9][0-9]{9}\b")
NOISE_KEYWORDS = (
    "INVOICE", "TAX", "GSTIN", "GST", "DATE", "ORIGINAL", "DUPLICATE", "BILL",
    "PAGE", "TERMS", "DECLARATION", "RECEIPT", "CERTIFICATE", "STATEMENT",
    "E-WAY", "IRN", "ACK", "QR", "PHONE", "EMAIL", "WWW", "HTTP", "CIN", "PAN",
)


def _lines(text: str) -> list[str]:
    cleaned = (text or "").replace("\r", "\n").replace("\u00a0", " ")
    return [re.sub(r"[ \t]+", " ", line).strip() for line in cleaned.split("\n") if line.strip()]


def _meta(value, confidence, method, status="found", source=None):
    return {
        "value": value,
        "confidence": round(float(confidence), 2),
        "method": method,
        "status": status,
        "source": source,
    }


def _extract_label_value(lines: list[str], labels: tuple[str, ...], max_len=90) -> tuple[str | None, str | None]:
    for index, line in enumerate(lines):
        upper = line.upper()
        for label in labels:
            position = upper.find(label)
            if position < 0:
                continue
            remainder = line[position + len(label):]
            remainder = re.sub(r"^[\s:.\-–]+", "", remainder).strip()
            if remainder and len(remainder) >= 2:
                return remainder[:max_len], line
            if index + 1 < len(lines):
                next_line = lines[index + 1].strip()
                if next_line and len(next_line) >= 2:
                    return next_line[:max_len], next_line
    return None, None


def _clean_party_name(value: str | None) -> str | None:
    if not value:
        return None
    text = value.strip(" -:|")
    text = re.split(r"\s{2,}|\bGSTIN\b|\bGST\b|\bPAN\b|\bA/?C\b|\bIFSC\b|\bADDRESS\b|\bADDR\b", text, flags=re.I)[0]
    text = re.sub(r"[\s,;.\-:]+$", "", text).strip()
    if len(text) < 3 or len(text) > 90:
        return None
    if sum(ch.isalpha() for ch in text) < 3:
        return None
    return text


def _first_labeled_amount(lines: list[str], labels: tuple[str, ...]) -> float | None:
    for line in lines:
        upper = line.upper()
        if any(label in upper for label in labels):
            if any(bad in upper for bad in ("QTY", "QUANTITY", "ITEMS", "WORDS")):
                continue
            values = []
            for match in re.finditer(AMOUNT_NUM, line, re.IGNORECASE):
                amount = parse_amount(match.group(1))
                if amount is not None:
                    values.append(amount)
            if values:
                return max(values)
    return None


def _line_amount(line: str, rate: float | None) -> float | None:
    work = line
    if rate is not None:
        work = re.sub(r"@\s*[0-9.]+\s*%", " ", work)
    values = []
    for match in re.finditer(AMOUNT_NUM, work, re.IGNORECASE):
        amount = parse_amount(match.group(1))
        if amount is not None:
            values.append(amount)
    if not values:
        return None
    if rate is not None and len(values) == 1 and abs(values[0] - rate) < 0.01:
        return None
    return max(values)


def _extract_tax_component(lines: list[str], keywords: tuple[str, ...]) -> tuple[float | None, float | None]:
    for line in lines:
        upper = line.upper()
        if not any(keyword in upper for keyword in keywords):
            continue
        if "TOTAL" in upper and not any(k in upper for k in ("CGST", "SGST", "IGST")):
            continue
        rate_match = re.search(r"@\s*([0-9]{1,2}(?:\.[0-9]{1,2})?)\s*%", upper)
        rate = float(rate_match.group(1)) if rate_match else None
        amount = _line_amount(line, rate)
        return amount, rate
    return None, None


def _extract_total(lines: list[str], labels: tuple[str, ...], exclude: tuple[str, ...] = ()) -> float | None:
    best = None
    for line in lines:
        upper = line.upper()
        if any(bad in upper for bad in exclude):
            continue
        if any(label in upper for label in labels):
            amount = _line_amount(line, None)
            if amount is not None and (best is None or amount > best):
                best = amount
    return best


def _parse_date_text(raw: str | None) -> tuple[str | None, date | None]:
    if not raw:
        return None, None
    cleaned = re.sub(r"\s+", " ", raw).strip(" .,")
    parsed, error = parse_date(cleaned)
    if parsed is None and cleaned != cleaned.title():
        parsed, error = parse_date(cleaned.title())
    return (parsed.isoformat() if parsed else None), parsed


def extract_fields(text: str, words: list[dict] | None, ocr_confidence: float | None = None,
                   doc_kind: str = "other") -> dict:
    lines = _lines(text)
    upper_text = "\n".join(lines).upper()
    label_conf = 0.9 if ocr_confidence is None else round(0.55 + 0.45 * ocr_confidence, 3)
    heuristic_conf = 0.62 if ocr_confidence is None else round(0.4 + 0.35 * ocr_confidence, 3)
    fields: dict[str, dict] = {}

    gstins = sorted(set(GSTIN_GLOBAL_RE.findall(upper_text)))
    pans = sorted(set(PAN_RE.findall(upper_text)))
    ifscs = sorted(set(IFSC_RE.findall(upper_text)))
    emails = sorted(set(EMAIL_RE.findall(text)))[:5]
    phones = sorted(set(PHONE_RE.findall(text)))[:5]

    invoice_number = None
    invoice_line = None
    for pattern in (
        r"(?:INVOICE|INV|BILL)\s*(?:NO\.?|NUMBER|#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/\-_.]{1,29})",
        r"(?:INVOICE|BILL)\s*[:\-]\s*([A-Z0-9][A-Z0-9\/\-_.]{1,29})",
    ):
        match = re.search(pattern, upper_text)
        if match:
            invoice_number = match.group(1).strip(" .-")
            invoice_line = match.group(0)
            break
    fields["invoice_number"] = _meta(invoice_number, label_conf, "labelled regex", source=invoice_line)

    date_raw = None
    for pattern in (
        r"(?:INVOICE|BILL|TAX\s+INVOICE)\s*DATE\s*[:\-]?\s*" + DATE_PATTERN,
        r"\bDATED?\s*[:\-]?\s*" + DATE_PATTERN,
        r"\bDATE\s*[:\-]?\s*" + DATE_PATTERN,
    ):
        match = re.search(pattern, upper_text)
        if match:
            date_raw = match.group(1)
            break
    invoice_date_iso, invoice_date = _parse_date_text(date_raw)
    fields["invoice_date"] = _meta(invoice_date_iso, label_conf, "labelled regex", source=date_raw)

    expiry_raw = None
    for pattern in (
        r"(?:VALID\s+(?:UP\s*)?TO|VALIDITY|EXPIRY(?:\s+DATE)?|EXPIRES?\s+ON|VALID\s+UNTIL)\s*[:\-]?\s*" + DATE_PATTERN,
    ):
        match = re.search(pattern, upper_text)
        if match:
            expiry_raw = match.group(1)
            break
    expiry_iso, expiry_date = _parse_date_text(expiry_raw)
    fields["expiry_date"] = _meta(expiry_iso, label_conf, "labelled regex", source=expiry_raw)

    taxable = _first_labeled_amount(lines, (
        "TAXABLE VALUE", "TAXABLE AMOUNT", "SUB TOTAL", "SUBTOTAL", "BASIC AMOUNT", "NET AMOUNT",
    ))
    cgst_amount, cgst_rate = _extract_tax_component(lines, ("CGST", "CENTRAL GST"))
    sgst_amount, sgst_rate = _extract_tax_component(lines, ("SGST", "STATE GST", "UTGST"))
    igst_amount, igst_rate = _extract_tax_component(lines, ("IGST", "INTEGRATED GST"))
    tax_total = _extract_total(lines, ("TOTAL TAX", "TAX AMOUNT", "GST AMOUNT"), exclude=("CGST", "SGST", "IGST"))
    total = _extract_total(
        lines,
        ("GRAND TOTAL", "TOTAL AMOUNT", "INVOICE TOTAL", "AMOUNT PAYABLE", "TOTAL PAYABLE",
         "NET PAYABLE", "AMOUNT DUE"),
        exclude=("TAX", "QTY", "QUANTITY", "ITEMS"),
    )
    if total is None:
        total = _extract_total(lines, ("TOTAL",), exclude=("TAX", "QTY", "QUANTITY", "ITEMS", "CGST", "SGST", "IGST", "HSN", "SAC"))
    tax_components = [value for value in (cgst_amount, sgst_amount, igst_amount) if value is not None]
    if tax_total is None and tax_components:
        tax_total = round(sum(tax_components), 2)
    if taxable is None and total is not None and tax_total is not None and total > tax_total:
        taxable = round(total - tax_total, 2)
        taxable_method = "derived from total minus tax"
    else:
        taxable_method = "labelled amount"

    amounts = {
        "taxable": taxable,
        "cgst": cgst_amount,
        "sgst": sgst_amount,
        "igst": igst_amount,
        "tax_total": tax_total,
        "total": total,
    }
    fields["taxable_amount"] = _meta(taxable, label_conf if taxable_method == "labelled amount" else heuristic_conf, taxable_method)
    fields["cgst"] = _meta(cgst_amount, label_conf, "labelled amount")
    fields["sgst"] = _meta(sgst_amount, label_conf, "labelled amount")
    fields["igst"] = _meta(igst_amount, label_conf, "labelled amount")
    fields["tax_total"] = _meta(tax_total, label_conf if tax_components else heuristic_conf,
                                "labelled amount" if tax_components else "derived from tax components")
    fields["total_amount"] = _meta(total, label_conf, "labelled amount")

    vendor, vendor_source = _extract_label_value(lines, (
        "SOLD BY", "SELLER", "SUPPLIER", "VENDOR", "FROM", "SERVICE PROVIDER",
    ))
    vendor = _clean_party_name(vendor)
    if not vendor:
        candidates = []
        for line in lines[:6]:
            upper = line.upper()
            if any(keyword in upper for keyword in NOISE_KEYWORDS):
                continue
            if 4 <= sum(ch.isalpha() for ch in line) and len(line) <= 80:
                candidates.append(line)
        if candidates:
            vendor = _clean_party_name(max(candidates, key=len))
            fields["vendor_name"] = _meta(vendor, heuristic_conf, "heuristic first-line", source=vendor)
    if "vendor_name" not in fields:
        fields["vendor_name"] = _meta(vendor, label_conf, "labelled value", source=vendor_source)

    buyer, buyer_source = _extract_label_value(lines, (
        "BILLED TO", "BILL TO", "BUYER", "CUSTOMER", "PURCHASER", "CONSIGNEE", "SHIP TO",
    ))
    buyer = _clean_party_name(buyer)
    fields["buyer_name"] = _meta(buyer, label_conf, "labelled value", status="found" if buyer else "not_found",
                                 source=buyer_source)

    po_number = None
    po_match = re.search(
        r"(?:\bP\.?O\.?\b\s*(?:NO\.?|NUMBER)?|PURCHASE\s+ORDER\s*(?:NO\.?|NUMBER)?)\s*[:\-]?\s*"
        r"(?!(?:DATE|NUMBER|NO)\b)([A-Z0-9][A-Z0-9\/\-_.]{1,29})",
        upper_text,
    )
    if po_match:
        po_number = po_match.group(1)
    fields["po_number"] = _meta(po_number, label_conf, "labelled regex", status="found" if po_number else "not_found")

    bank_account = None
    account_match = re.search(
        r"(?:A/?C|ACCOUNT)\s*(?:NO\.?|NUMBER)?\s*[:\-]?\s*([0-9][0-9 ]{8,19})",
        upper_text,
    )
    if account_match:
        bank_account = re.sub(r"\s+", "", account_match.group(1))
    fields["bank_account"] = _meta(bank_account, label_conf, "labelled regex", status="found" if bank_account else "not_found")
    fields["ifsc"] = _meta(ifscs[0] if ifscs else None, label_conf, "regex",
                            status="found" if ifscs else "not_found")

    bank_name, bank_source = _extract_label_value(lines, ("BANK NAME", "BANK BRANCH", "BRANCH"))
    fields["bank_name"] = _meta(bank_name, label_conf, "labelled value", status="found" if bank_name else "not_found",
                                source=bank_source)

    address, address_source = _extract_label_value(lines, ("ADDRESS", "ADDR", "REGISTERED OFFICE"))
    fields["address"] = _meta(address, label_conf, "labelled value", status="found" if address else "not_found",
                              source=address_source)

    salary = None
    salary_match = re.search(
        r"(?:CTC|SALARY|ANNUAL\s+COMPENSATION|MONTHLY\s+SALARY|GROSS\s+SALARY)\s*[:\-]?\s*"
        r"(?:Rs\.?|INR|\u20b9)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)",
        upper_text,
    )
    if salary_match:
        salary = parse_amount(salary_match.group(1))
    fields["salary_amount"] = _meta(salary, label_conf, "labelled regex", status="found" if salary else "not_found")

    irn = None
    irn_match = re.search(r"\b([0-9a-fA-F]{64})\b", text)
    if irn_match:
        irn = irn_match.group(1).lower()
    fields["irn"] = _meta(irn, label_conf, "64-hex pattern", status="found" if irn else "not_found")

    hsn_codes = sorted(set(re.findall(r"(?:HSN|SAC)\s*(?:CODE)?\s*[:\-]?\s*([0-9]{4,8})", upper_text)))
    place_of_supply = None
    pos_match = re.search(r"PLACE\s+OF\s+SUPPLY\s*[:\-]?\s*([A-Z][A-Z ]{2,40})", upper_text)
    if pos_match:
        place_of_supply = pos_match.group(1).strip()

    primary_gstin = gstins[0] if gstins else None
    gstin_context = None
    for line in lines:
        if "GSTIN" in line.upper() and GSTIN_GLOBAL_RE.search(line.upper()):
            primary_gstin = GSTIN_GLOBAL_RE.search(line.upper()).group(0)
            gstin_context = line
            break
    fields["gstin"] = _meta(primary_gstin, label_conf, "regex/checksum", status="found" if primary_gstin else "not_found",
                            source=gstin_context)

    return {
        "gstin": primary_gstin,
        "gstins": gstins,
        "pan": pans[0] if pans else None,
        "pans": pans,
        "ifsc": ifscs[0] if ifscs else None,
        "ifscs": ifscs,
        "bank_account": bank_account,
        "invoice_number": invoice_number,
        "normalized_invoice_number": normalize_invoice_number(invoice_number),
        "invoice_date": invoice_date_iso,
        "invoice_date_raw": date_raw,
        "expiry_date": expiry_iso,
        "expiry_date_raw": expiry_raw,
        "amounts": amounts,
        "tax_rates": {"cgst": cgst_rate, "sgst": sgst_rate, "igst": igst_rate},
        "vendor_name": vendor,
        "buyer_name": buyer,
        "po_number": po_number,
        "bank_name": fields["bank_name"]["value"],
        "address": fields["address"]["value"],
        "salary_amount": salary,
        "irn": irn,
        "hsn_codes": hsn_codes,
        "place_of_supply": place_of_supply,
        "emails": emails,
        "phones": phones,
        "fields": fields,
        "lines": lines,
        "doc_kind": doc_kind,
        "text_present": bool(upper_text.strip()),
    }
