import json
import urllib.parse
import urllib.request
from datetime import date, timedelta

from flask import current_app

from app.modules.smart_verification.validators import (
    tax_rate_allowed,
    validate_bank_account,
    validate_gstin,
    validate_ifsc,
    validate_invoice_number,
    validate_pan,
)
from app.utils.text import name_similarity
from app.utils.time import parse_date

INVOICE_KINDS = {"invoice", "purchase_order", "payment_receipt"}
GSTIN_REQUIRED_KINDS = {"invoice", "gst_certificate"}
PARTY_KINDS = {"invoice", "purchase_order", "payment_receipt", "contract"}
KEYWORD_MAP = {
    "invoice": ("INVOICE", "TAX INVOICE", "BILL"),
    "purchase_order": ("PURCHASE ORDER", "P.O.", "PO NO"),
    "gst_certificate": ("GST", "GOODS AND SERVICES TAX", "REGISTRATION"),
    "quality_certificate": ("ISO", "CERTIFICATE", "QUALITY"),
    "contract": ("AGREEMENT", "CONTRACT"),
    "bank_letter": ("BANK", "ACCOUNT"),
    "offer_letter": ("OFFER", "APPOINTMENT", "JOINING"),
    "salary_slip": ("SALARY", "EARNINGS", "PAYSLIP"),
    "educational_certificate": ("CERTIFICATE", "UNIVERSITY", "DEGREE", "BOARD"),
    "rental_agreement": ("RENT", "LEASE", "TENANT", "LANDLORD"),
    "payment_receipt": ("RECEIPT", "PAID", "PAYMENT"),
    "identity_document": ("IDENTITY", "AADHAAR", "PAN", "PASSPORT", "LICENCE"),
}


def _check(code, name, category, status, severity, message, expected=None, actual=None, details=None):
    return {
        "code": code,
        "name": name,
        "category": category,
        "status": status,
        "severity": severity,
        "message": message,
        "expected": str(expected)[:255] if expected is not None else None,
        "actual": str(actual)[:255] if actual is not None else None,
        "details": details or {},
    }


def _external_lookup(url: str, key: str, param: str, value: str) -> dict:
    if not url or not key:
        return {
            "configured": False,
            "status": "unverified",
            "message": "External verification was NOT performed because no authorised API is configured. "
                       "Result is based on local format/checksum validation only.",
        }
    try:
        query = urllib.parse.urlencode({param: value})
        request = urllib.request.Request(
            f"{url}?{query}",
            headers={"X-API-Key": key, "Accept": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=6) as response:
            payload = json.loads(response.read().decode("utf-8", errors="replace"))
        valid = payload.get("valid")
        if isinstance(valid, bool):
            return {
                "configured": True,
                "status": "passed" if valid else "failed",
                "message": "External provider responded that the identifier is "
                           + ("valid." if valid else "not valid or not found."),
                "provider_response": {k: payload[k] for k in list(payload)[:8]},
            }
        return {
            "configured": True,
            "status": "unverified",
            "message": "External provider responded, but the response did not contain a boolean 'valid' field.",
            "provider_response": {k: payload[k] for k in list(payload)[:8]},
        }
    except Exception as exc:
        return {
            "configured": True,
            "status": "unverified",
            "message": f"External verification could not be completed ({type(exc).__name__}). "
                       "No conclusion was drawn from this attempt.",
        }


def run_verification_checks(document, fields: dict, metadata: dict, ocr: dict,
                            organisation=None, supplier=None) -> list[dict]:
    checks: list[dict] = []
    kind = document.doc_kind
    text = fields.get("lines", [])
    amounts = fields.get("amounts", {})
    tax_rates = fields.get("tax_rates", {})
    ocr_ok = ocr.get("status") == "ok"
    ocr_caveat = " OCR may have misread characters; confirm against the source document."

    checks.append(_check(
        "text_extraction", "Text extraction", "verification",
        "passed" if ocr_ok else "skipped",
        "info",
        f"Extracted {ocr.get('word_count', 0)} words with {ocr.get('engine', 'n/a')} "
        f"({ocr.get('language', 'n/a')}). {ocr.get('note') or ''}".strip(),
        details={"engine": ocr.get("engine"), "language": ocr.get("language"),
                 "mean_confidence": ocr.get("mean_confidence")},
    ))

    gstin = fields.get("gstin")
    if gstin:
        validation = validate_gstin(gstin)
        checks.append(_check(
            "gstin_format", "GSTIN structure & checksum", "verification",
            "passed" if validation["valid"] else "failed",
            "low" if validation["valid"] else "high",
            ("GSTIN passed structural and checksum validation. " + validation.get("note", "")) if validation["valid"]
            else ("GSTIN validation failed: " + " ".join(validation["errors"]) + ocr_caveat),
            expected="Valid 15-character GSTIN with correct checksum",
            actual=gstin,
            details=validation,
        ))
    else:
        required = kind in GSTIN_REQUIRED_KINDS
        checks.append(_check(
            "gstin_format", "GSTIN structure & checksum", "verification",
            "failed" if required else "skipped",
            "medium" if required else "info",
            "No GSTIN was detected in the document."
            + (" A GSTIN is normally expected on this document type." if required else ""),
            details={"required": required},
        ))

    if fields.get("pan"):
        pan = validate_pan(fields["pan"])
        checks.append(_check(
            "pan_format", "PAN format", "verification",
            "passed" if pan["valid"] else "warning",
            "low" if pan["valid"] else "medium",
            "PAN matches the expected format. " + pan["note"] if pan["valid"]
            else "Detected PAN does not match AAAAA9999A format." + ocr_caveat,
            expected="AAAAA9999A", actual=pan["value"], details=pan,
        ))
    else:
        checks.append(_check("pan_format", "PAN format", "verification", "skipped", "info",
                             "No PAN was detected; PAN validation was skipped."))

    if fields.get("ifsc"):
        ifsc = validate_ifsc(fields["ifsc"])
        checks.append(_check(
            "ifsc_format", "IFSC format", "verification",
            "passed" if ifsc["valid"] else "failed",
            "low" if ifsc["valid"] else "medium",
            f"IFSC format is {'valid' if ifsc['valid'] else 'invalid'}. "
            + ("Bank prefix is recognised among major banks. " if ifsc.get("prefix_known") else "")
            + ifsc["note"],
            expected="AAAA0XXXXXX", actual=ifsc["value"], details=ifsc,
        ))
    else:
        checks.append(_check("ifsc_format", "IFSC format", "verification", "skipped", "info",
                             "No IFSC was detected; format validation was skipped."))

    if fields.get("bank_account"):
        account = validate_bank_account(fields["bank_account"])
        checks.append(_check(
            "bank_account_format", "Bank account format", "verification",
            "passed" if account["valid"] else "failed",
            "low" if account["valid"] else "medium",
            ("Bank account number format is plausible. " if account["valid"] else "Bank account number format is invalid. ")
            + account["note"],
            expected="9–18 digits", actual=account["value"], details=account,
        ))
    else:
        checks.append(_check("bank_account_format", "Bank account format", "verification", "skipped", "info",
                             "No bank account number was detected."))

    invoice_kinds = {"invoice", "payment_receipt"}
    if kind in invoice_kinds or fields.get("invoice_number"):
        invoice_number = validate_invoice_number(fields.get("invoice_number"))
        checks.append(_check(
            "invoice_number_format", "Invoice number format", "verification",
            "passed" if invoice_number["valid"] else ("failed" if not fields.get("invoice_number") else "warning"),
            "low" if invoice_number["valid"] else "medium",
            "Invoice number is present and syntactically valid." if invoice_number["valid"]
            else " ".join(invoice_number["errors"]) + ocr_caveat,
            actual=invoice_number["value"], details=invoice_number,
        ))
    else:
        checks.append(_check("invoice_number_format", "Invoice number format", "verification", "skipped", "info",
                             "Invoice number check does not apply to this document type."))

    parsed_date, date_error = parse_date(fields.get("invoice_date")) if fields.get("invoice_date") else (None, None)
    if kind in INVOICE_KINDS:
        if not parsed_date:
            checks.append(_check(
                "invoice_date", "Invoice date validity", "verification", "failed", "medium",
                "No usable invoice date was detected." + (f" ({date_error})" if date_error else ""),
                details={"raw": fields.get("invoice_date_raw")},
            ))
        else:
            today = date.today()
            future = parsed_date > today + timedelta(days=7)
            too_old = parsed_date < today - timedelta(days=365 * 6)
            status = "failed" if future else ("warning" if too_old else "passed")
            severity = "medium" if future else ("low" if too_old else "low")
            message = (f"Invoice date {parsed_date.isoformat()} is in the future." if future
                       else f"Invoice date {parsed_date.isoformat()} is more than six years old."
                       if too_old else f"Invoice date {parsed_date.isoformat()} is plausible.")
            checks.append(_check("invoice_date", "Invoice date validity", "verification", status, severity,
                                 message, details={"date": parsed_date.isoformat()}))
    elif fields.get("invoice_date"):
        within_window = parsed_date is not None
        checks.append(_check(
            "invoice_date", "Invoice date validity", "verification",
            "passed" if within_window else "warning", "low",
            f"Document date parsed as {fields.get('invoice_date')}." if within_window
            else "A date was detected but could not be parsed.",
        ))
    else:
        checks.append(_check("invoice_date", "Invoice date validity", "verification", "skipped", "info",
                             "No date was detected or the document type does not require one."))

    total = amounts.get("total")
    taxable = amounts.get("taxable")
    tax_components = [amounts.get("cgst"), amounts.get("sgst"), amounts.get("igst")]
    component_sum = round(sum(v for v in tax_components if v is not None), 2) if any(
        v is not None for v in tax_components) else None
    tax_total = amounts.get("tax_total") if amounts.get("tax_total") is not None else component_sum
    if total is None:
        checks.append(_check(
            "invoice_arithmetic", "Invoice arithmetic", "verification", "skipped", "info",
            "A grand total could not be extracted, so arithmetic verification was skipped.",
            details={"amounts": amounts},
        ))
    elif taxable is None:
        checks.append(_check(
            "invoice_arithmetic", "Invoice arithmetic", "verification", "skipped", "info",
            "Taxable value could not be extracted, so the total could not be independently recomputed.",
            actual=f"{total:.2f}", details={"amounts": amounts},
        ))
    else:
        tax_sum = tax_total if tax_total is not None else 0.0
        expected_total = round(taxable + tax_sum, 2)
        delta = round(abs(expected_total - total), 2)
        tolerance = max(1.0, round(total * 0.01, 2))
        balanced = delta <= tolerance
        status = "passed" if balanced else "failed"
        severity = "low" if balanced else "high"
        message = (
            f"Taxable {taxable:.2f} + tax {tax_sum:.2f} = {expected_total:.2f}, "
            f"matching the stated total {total:.2f} (difference {delta:.2f})." if balanced
            else f"Arithmetic mismatch: taxable {taxable:.2f} + tax {tax_sum:.2f} = {expected_total:.2f}, "
                 f"but the stated total is {total:.2f} (difference {delta:.2f})."
        )
        cgst, sgst = amounts.get("cgst"), amounts.get("sgst")
        cgst_sgst_issue = (
            cgst is not None and sgst is not None
            and abs(cgst - sgst) > max(2.0, 0.02 * max(cgst, sgst))
        )
        if balanced and cgst_sgst_issue:
            status, severity = "warning", "medium"
            message += f" CGST ({cgst:.2f}) and SGST ({sgst:.2f}) are not balanced."
        checks.append(_check(
            "invoice_arithmetic", "Invoice arithmetic", "verification", status, severity, message,
            expected=f"{expected_total:.2f}", actual=f"{total:.2f}",
            details={"taxable": taxable, "tax_total": tax_sum, "total": total, "delta": delta,
                     "tolerance": tolerance, "cgst_sgst_imbalance": cgst_sgst_issue},
        ))

    rate_warnings = []
    for name, rate in (("CGST", tax_rates.get("cgst")), ("SGST", tax_rates.get("sgst")), ("IGST", tax_rates.get("igst"))):
        if rate is None:
            continue
        allowed = tax_rate_allowed(rate)
        if not allowed and name in ("CGST", "SGST"):
            # Component rates are half of the headline slab (e.g. 9% CGST + 9% SGST).
            allowed = tax_rate_allowed(round(rate * 2, 2))
        if not allowed:
            rate_warnings.append(f"{name} rate {rate}% is not a standard GST rate.")
    if taxable and tax_total:
        effective = round(tax_total / taxable * 100, 2)
        if not tax_rate_allowed(effective) and not tax_rate_allowed(round(effective / 2, 2)):
            rate_warnings.append(f"Effective tax rate {effective}% does not match a standard GST rate.")
    else:
        effective = None
    if rate_warnings:
        checks.append(_check(
            "tax_rate", "GST rate plausibility", "verification", "warning", "medium",
            " ".join(rate_warnings) + " Non-standard rates can be legitimate for specific goods/services.",
            details={"rates": tax_rates, "effective_rate": effective},
        ))
    elif tax_total is not None or tax_rates.get("cgst") or tax_rates.get("igst"):
        checks.append(_check(
            "tax_rate", "GST rate plausibility", "verification", "passed", "low",
            "Detected tax rates/effective rate fall within the standard GST slabs set used by this baseline.",
            details={"rates": tax_rates, "effective_rate": effective},
        ))
    else:
        checks.append(_check("tax_rate", "GST rate plausibility", "verification", "skipped", "info",
                             "No tax rate or tax amount was detected."))

    if organisation and kind in PARTY_KINDS and (fields.get("buyer_name") or fields.get("vendor_name")):
        org_name = organisation.name
        buyer_sim = name_similarity(org_name, fields.get("buyer_name"))
        vendor_sim = name_similarity(org_name, fields.get("vendor_name"))
        best = max(buyer_sim, vendor_sim)
        matched_side = "buyer" if buyer_sim >= vendor_sim else "seller/vendor"
        if best >= 0.55:
            checks.append(_check(
                "buyer_seller_consistency", "Business name consistency", "verification", "passed", "low",
                f"Your organisation name matches the extracted {matched_side} name (similarity {best:.2f}).",
                expected=org_name, actual=fields.get("buyer_name") or fields.get("vendor_name"),
                details={"buyer_similarity": buyer_sim, "vendor_similarity": vendor_sim},
            ))
        else:
            checks.append(_check(
                "buyer_seller_consistency", "Business name consistency", "verification", "warning", "medium",
                f"Your organisation name does not closely match either party name (best similarity {best:.2f}). "
                "Names are compared heuristically; abbreviations and OCR errors can cause mismatches.",
                expected=org_name,
                actual=fields.get("buyer_name") or fields.get("vendor_name"),
                details={"buyer_similarity": buyer_sim, "vendor_similarity": vendor_sim},
            ))
    else:
        checks.append(_check("buyer_seller_consistency", "Business name consistency", "verification", "skipped", "info",
                             "Party names or an organisation profile were not available for comparison, "
                             "or the check does not apply to this document type."))

    if supplier:
        document_gstins = {g.upper() for g in (fields.get("gstins") or []) if g}
        if supplier.gstin and document_gstins:
            match = supplier.gstin.upper() in document_gstins
            checks.append(_check(
                "supplier_gstin_match", "Supplier GSTIN match", "verification",
                "passed" if match else "failed", "low" if match else "high",
                "A GSTIN in the document matches the onboarded supplier record." if match
                else "No GSTIN in the document matches the onboarded supplier record. Confirm the correct supplier entity.",
                expected=supplier.gstin, actual=fields.get("gstin"),
                details={"document_gstins": sorted(document_gstins)},
            ))
        if supplier.bank_account and fields.get("bank_account"):
            match = supplier.bank_account.replace(" ", "") == fields["bank_account"].replace(" ", "")
            checks.append(_check(
                "supplier_bank_match", "Supplier bank-account match", "verification",
                "passed" if match else "failed", "low" if match else "high",
                "Bank account matches the onboarded supplier record." if match
                else "Bank account in the document differs from the onboarded supplier record. "
                     "This is a common payment-diversion indicator; verify with the supplier through an independent channel.",
                expected=supplier.bank_account, actual=fields["bank_account"],
            ))
        elif supplier.ifsc and fields.get("ifsc"):
            match = supplier.ifsc.upper() == fields["ifsc"].upper()
            checks.append(_check(
                "supplier_bank_match", "Supplier bank-account match", "verification",
                "passed" if match else "warning", "low" if match else "medium",
                "IFSC matches the onboarded supplier record." if match
                else "IFSC differs from the onboarded supplier record.",
                expected=supplier.ifsc, actual=fields["ifsc"],
            ))
        if supplier.name and fields.get("vendor_name"):
            similarity = name_similarity(supplier.name, fields["vendor_name"])
            checks.append(_check(
                "supplier_name_match", "Supplier name similarity", "verification",
                "passed" if similarity >= 0.6 else "warning", "low" if similarity >= 0.6 else "medium",
                f"Vendor name similarity to the onboarded supplier is {similarity:.2f}.",
                expected=supplier.name, actual=fields["vendor_name"], details={"similarity": similarity},
            ))
    else:
        checks.append(_check("supplier_match", "Supplier profile comparison", "verification", "skipped", "info",
                             "No supplier profile is linked to this document."))

    expiry_date = document.expiry_date
    if not expiry_date and fields.get("expiry_date"):
        expiry_date, _ = parse_date(fields["expiry_date"])
    if expiry_date:
        days = (expiry_date - date.today()).days
        if days < 0:
            status, severity = "failed", "medium"
            message = f"Document expired on {expiry_date.isoformat()} ({abs(days)} days ago)."
        elif days <= 30:
            status, severity = "warning", "medium"
            message = f"Document expires in {days} day(s) on {expiry_date.isoformat()}."
        else:
            status, severity = "passed", "low"
            message = f"Document is valid until {expiry_date.isoformat()} ({days} days remaining)."
        checks.append(_check("expiry_status", "Document expiry", "verification", status, severity, message,
                             details={"expiry_date": expiry_date.isoformat(), "days_remaining": days}))
    else:
        checks.append(_check("expiry_status", "Document expiry", "verification", "skipped", "info",
                             "No expiry date was detected or provided."))

    keywords = KEYWORD_MAP.get(kind)
    if keywords and ocr_ok:
        upper = (ocr.get("text") or "").upper()
        hits = [word for word in keywords if word in upper]
        checks.append(_check(
            "document_keywords", "Document content consistency", "verification",
            "passed" if hits else "warning", "low" if hits else "medium",
            f"Found document-type keywords: {', '.join(hits)}." if hits
            else f"No keywords typical of a '{kind}' document were found. Confirm the selected document type.",
            details={"keywords": list(keywords), "hits": hits},
        ))
    else:
        checks.append(_check("document_keywords", "Document content consistency", "verification", "skipped", "info",
                             "Content keyword check not applicable or OCR text unavailable."))

    if fields.get("gstin"):
        external = _external_lookup(
            current_app.config.get("EXTERNAL_GST_API_URL", ""),
            current_app.config.get("EXTERNAL_GST_API_KEY", ""),
            "gstin", fields["gstin"],
        )
        checks.append(_check(
            "external_gst", "External GST registration check", "external",
            external["status"],
            "info" if external["status"] != "failed" else "high",
            external["message"],
            actual=fields["gstin"],
            details={k: v for k, v in external.items() if k not in ("message",)},
        ))
    if fields.get("ifsc"):
        external = _external_lookup(
            current_app.config.get("EXTERNAL_BANK_API_URL", ""),
            current_app.config.get("EXTERNAL_BANK_API_KEY", ""),
            "ifsc", fields.get("ifsc") or "",
        )
        checks.append(_check(
            "external_bank", "External bank account check", "external",
            external["status"],
            "info" if external["status"] != "failed" else "high",
            external["message"],
            details={k: v for k, v in external.items() if k not in ("message",)},
        ))

    return checks
