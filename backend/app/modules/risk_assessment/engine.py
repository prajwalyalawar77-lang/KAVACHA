"""Explainable risk assessment.

The score is a transparent weighted sum of evidence with per-module caps. It is
*not* a calibrated fraud probability and never claims certainty. Every signal
carries its own weight, evidence and reason so users can see why a score was
produced. A trained ML scorer can be registered at runtime via set_ml_scorer();
when absent, the documented rule baseline below is used.
"""

from flask import current_app

from app.constants import DISCLAIMER

ENGINE_VERSION = "kavacha-risk-1.0-rules"

MODULE_CAPS = {
    "document_forensics": 40,
    "metadata": 15,
    "verification": 45,
    "fraud_intelligence": 40,
    "public_safety": 20,
}

CHECK_WEIGHTS = {
    "gstin_format": {"failed": 20, "warning": 6},
    "invoice_arithmetic": {"failed": 18, "warning": 8},
    "invoice_number_format": {"failed": 8, "warning": 3},
    "invoice_date": {"failed": 8, "warning": 3},
    "ifsc_format": {"failed": 6, "warning": 2},
    "bank_account_format": {"failed": 6, "warning": 2},
    "pan_format": {"failed": 4, "warning": 2},
    "tax_rate": {"failed": 0, "warning": 4},
    "buyer_seller_consistency": {"failed": 0, "warning": 10},
    "supplier_gstin_match": {"failed": 14, "warning": 6},
    "supplier_bank_match": {"failed": 16, "warning": 8},
    "supplier_name_match": {"failed": 0, "warning": 8},
    "expiry_status": {"failed": 10, "warning": 6},
    "document_keywords": {"failed": 0, "warning": 5},
    "external_gst": {"failed": 12, "warning": 0},
    "external_bank": {"failed": 10, "warning": 0},
    "public_upfront_payment": {"failed": 0, "warning": 16},
    "public_free_email": {"failed": 0, "warning": 4},
    "public_urgency_pressure": {"failed": 0, "warning": 3},
    "public_suspicious_links": {"failed": 0, "warning": 8},
    "public_pii_exposure": {"failed": 0, "warning": 3},
}

FORENSIC_WEIGHTS = {
    "forensic.copy_move": {"medium": 14, "low": 6, "high": 18},
    "forensic.ela_localised": {"medium": 8, "low": 4, "high": 12},
    "forensic.noise_inconsistency": {"medium": 8, "low": 4, "high": 12},
    "forensic.font_inconsistency": {"medium": 7, "low": 5, "high": 9},
}

METADATA_WEIGHTS = {
    "meta.editing_software": 8,
    "meta.exif_editing_software": 8,
    "meta.incremental_updates": 4,
    "meta.modified_after_creation": 2,
    "meta.no_digital_signature": 0,
    "meta.signature_present": 0,
    "meta.exif_present": 0,
}

FRAUD_WEIGHTS = {
    "duplicate_document": 30,
    "repeated_invoice_number": 20,
    "near_duplicate_document": 15,
    "shared_bank_account": 8,
    "shared_gstin": 8,
    "invoice_amount_outlier": 4,
    "public_report": 10,
}
FRAUD_SEVERITY_FALLBACK = {"critical": 22, "high": 16, "medium": 8, "low": 4, "info": 0}

_ml_scorer = None


def set_ml_scorer(fn) -> None:
    """Register a replaceable ML scorer.

    The callable receives the evidence bundle and must return either None or
    {"score": 0-100, "confidence": 0-1, "explanation": str}. Its output is
    blended 50/50 with the transparent rule baseline and labelled as ML.
    """
    global _ml_scorer
    _ml_scorer = fn


def ml_scorer_available() -> bool:
    return _ml_scorer is not None


def thresholds() -> dict:
    return {
        "medium": current_app.config["RISK_MEDIUM_THRESHOLD"],
        "high": current_app.config["RISK_HIGH_THRESHOLD"],
        "critical": current_app.config["RISK_CRITICAL_THRESHOLD"],
    }


def classify(score: float) -> str:
    values = thresholds()
    if score <= values["medium"]:
        return "low"
    if score <= values["high"]:
        return "medium"
    if score <= values["critical"]:
        return "high"
    return "critical"


def _signal(code, module, title, status, severity, weight, explanation, evidence=None):
    return {
        "code": code,
        "module": module,
        "title": title,
        "status": status,
        "severity": severity,
        "weight": round(float(weight), 1),
        "explanation": explanation,
        "evidence": evidence or {},
    }


def _check_signals(checks: list[dict]) -> list[dict]:
    signals = []
    for check in checks:
        status = check.get("status")
        if status not in ("failed", "warning"):
            continue
        weights = CHECK_WEIGHTS.get(check.get("code"), {})
        weight = weights.get(status, 0)
        if weight <= 0:
            continue
        module = "public_safety" if check.get("category") == "public_safety" else (
            "verification" if check.get("category") == "verification" else "verification")
        signals.append(_signal(
            check.get("code"), module, check.get("name"), status, check.get("severity"), weight,
            check.get("message"), {"expected": check.get("expected"), "actual": check.get("actual"),
                                   "details": check.get("details")},
        ))
    return signals


def _forensic_signals(tampering: dict | None) -> list[dict]:
    if not tampering:
        return []
    signals = []
    for indicator in tampering.get("indicators", []):
        code = indicator.get("code")
        severity = indicator.get("severity", "info")
        weights = FORENSIC_WEIGHTS.get(code)
        if weights:
            weight = weights.get(severity, 0)
        else:
            weight = {"critical": 14, "high": 12, "medium": 6, "low": 3}.get(severity, 0)
        if weight <= 0:
            continue
        signals.append(_signal(
            code, "document_forensics", indicator.get("label"), severity, severity, weight,
            indicator.get("detail"), indicator.get("evidence"),
        ))
    return signals


def _metadata_signals(metadata: dict | None) -> list[dict]:
    if not metadata:
        return []
    signals = []
    for indicator in metadata.get("indicators", []):
        code = indicator.get("code")
        weight = METADATA_WEIGHTS.get(code, 0)
        if weight <= 0:
            continue
        signals.append(_signal(
            code, "metadata", indicator.get("label"), "warning", indicator.get("severity"),
            weight, indicator.get("detail"), indicator.get("evidence"),
        ))
    return signals


def _fraud_signals(alerts) -> list[dict]:
    signals = []
    for alert in alerts or []:
        alert_type = alert.get("alert_type") if isinstance(alert, dict) else alert.alert_type
        severity = alert.get("severity") if isinstance(alert, dict) else alert.severity
        title = alert.get("title") if isinstance(alert, dict) else alert.title
        description = alert.get("description") if isinstance(alert, dict) else alert.description
        status = alert.get("status") if isinstance(alert, dict) else alert.status
        if status and status != "open":
            continue
        weight = FRAUD_WEIGHTS.get(alert_type, FRAUD_SEVERITY_FALLBACK.get(severity, 0))
        if weight <= 0:
            continue
        signals.append(_signal(
            alert_type, "fraud_intelligence", title, "warning", severity, weight, description,
            {"alert_type": alert_type},
        ))
    return signals


def _recommendations(checks: list[dict], alerts: list[dict], category: str) -> list[str]:
    failed_codes = {c.get("code") for c in checks if c.get("status") in ("failed", "warning")}
    alert_types = {
        (a.get("alert_type") if isinstance(a, dict) else a.alert_type) for a in alerts
    }
    recommendations = []
    if "gstin_format" in failed_codes:
        recommendations.append("Validate the GSTIN on the official GST portal or an authorised API and compare it with the supplier's GST certificate.")
    if "invoice_arithmetic" in failed_codes:
        recommendations.append("Ask the supplier to reconcile line items, taxable value, tax and the grand total, and reissue the invoice if needed.")
    if {"duplicate_document", "near_duplicate_document"} & alert_types:
        recommendations.append("Confirm whether this is a re-upload or a recycled copy; reconcile against purchase orders and payment records.")
    if "repeated_invoice_number" in alert_types:
        recommendations.append("Check the invoice number against the accounting system and the supplier's own records.")
    if "supplier_bank_match" in failed_codes:
        recommendations.append("Independently confirm bank details by calling the supplier on a previously known number before releasing payment.")
    if {"forensic.copy_move", "forensic.ela_localised", "forensic.noise_inconsistency", "forensic.font_inconsistency"} & failed_codes:
        recommendations.append("Inspect the highlighted regions at full resolution and request the original native file or a signed copy from the sender.")
    if {"meta.editing_software", "meta.exif_editing_software", "meta.incremental_updates"} & failed_codes:
        recommendations.append("Request the unedited source document and, where possible, a fresh copy directly from the issuing organisation.")
    if "expiry_status" in failed_codes:
        recommendations.append("Request a renewed certificate or licence before relying on this document.")
    if "buyer_seller_consistency" in failed_codes:
        recommendations.append("Verify the legal business names and registration identifiers on an official registry.")
    if "public_upfront_payment" in failed_codes:
        recommendations.append("Do not pay any fee or deposit. Verify the employer/landlord through official contact details you find independently.")
    if {"public_suspicious_links", "public_free_email"} & failed_codes:
        recommendations.append("Use only official phone/email channels and avoid clicking links or sharing OTPs and passwords.")
    if "external_gst" in {c.get("code") for c in checks if c.get("status") == "unverified"}:
        recommendations.append("External GST verification was not performed. Treat the GSTIN as format-validated only until an authorised lookup is completed.")
    if category in ("medium", "high", "critical") and len(recommendations) < 2:
        recommendations.append("Perform a manual review of the document against the original source before relying on it.")
    if not recommendations:
        recommendations.append("No specific remediation is required by the completed checks; retain the source document for audit.")
    return recommendations[:8]


def assess(document, checks: list[dict], tampering: dict | None, metadata: dict | None,
          alerts: list, ocr: dict | None) -> dict:
    signals = []
    signals.extend(_check_signals(checks))
    signals.extend(_forensic_signals(tampering))
    signals.extend(_metadata_signals(metadata))
    signals.extend(_fraud_signals(alerts))
    # Public checks are categorised separately for the cap.
    for signal in signals:
        if signal["code"].startswith("public_"):
            signal["module"] = "public_safety"

    module_totals = {module: 0.0 for module in MODULE_CAPS}
    for signal in signals:
        module = signal["module"] if signal["module"] in MODULE_CAPS else "verification"
        module_totals[module] += signal["weight"]
    capped = {module: min(MODULE_CAPS[module], value) for module, value in module_totals.items()}
    rule_score = round(min(100.0, sum(capped.values())), 1)

    counts = {"passed": 0, "failed": 0, "warning": 0, "skipped": 0, "unverified": 0}
    for check in checks:
        status = check.get("status", "skipped")
        counts[status] = counts.get(status, 0) + 1

    ocr = ocr or {}
    text_conf = ocr.get("mean_confidence")
    if text_conf is None and (ocr.get("status") == "ok"):
        text_conf = 0.85 if "pymupdf" in str(ocr.get("engine", "")) else 0.6
    completed = counts["passed"] + counts["failed"] + counts["warning"]
    total_conclusive = completed + counts["skipped"]
    completeness = (completed / total_conclusive) if total_conclusive else 0.0
    forensics_ran = 1.0 if (tampering and tampering.get("analysis_pages")) else 0.0
    confidence = 0.3 + 0.35 * (text_conf or 0.0) + 0.2 * completeness + 0.1 * forensics_ran
    if ocr.get("status") in ("error", "empty"):
        confidence = min(confidence, 0.45)
    confidence = round(min(0.95, max(0.15, confidence)), 2)

    score = rule_score
    ml_explanation = None
    if _ml_scorer is not None:
        try:
            evidence_bundle = {
                "signals": signals,
                "module_totals": module_totals,
                "counts": counts,
                "document": {"kind": document.doc_kind, "mime": document.mime_type},
            }
            ml_result = _ml_scorer(evidence_bundle)
            if ml_result and isinstance(ml_result.get("score"), (int, float)):
                blended = 0.5 * rule_score + 0.5 * float(ml_result["score"])
                score = round(min(100.0, max(0.0, blended)), 1)
                ml_explanation = ml_result.get("explanation")
                if ml_result.get("confidence") is not None:
                    confidence = round((confidence + float(ml_result["confidence"])) / 2, 2)
        except Exception as exc:
            ml_explanation = f"ML scorer failed and was ignored: {type(exc).__name__}"

    category = classify(score)
    top_signals = sorted(signals, key=lambda s: s["weight"], reverse=True)[:3]
    if score <= 30:
        summary = (
            f"Risk score {score:.1f}/100 (Low). No strong indicators were found in the completed checks."
            + (f" Note: {counts['skipped']} check(s) could not be completed." if counts["skipped"] else "")
            + " A low score does not guarantee authenticity."
        )
    else:
        drivers = "; ".join(signal["title"] for signal in top_signals)
        summary = (
            f"Risk score {score:.1f}/100 ({category.title()}). Main contributing evidence: {drivers}. "
            f"Verification confidence is {confidence * 100:.0f}%. Scores use configurable demonstration "
            "thresholds, not calibrated fraud probabilities."
        )
    if ml_explanation:
        summary += f" ML note: {ml_explanation}"
    recommendations = _recommendations(checks, [a for a in alerts or [] if (a.get("status") if isinstance(a, dict) else a.status) in (None, "open")], category)

    return {
        "score": score,
        "category": category,
        "confidence": confidence,
        "counts": counts,
        "summary": summary,
        "signals": sorted(signals, key=lambda s: s["weight"], reverse=True),
        "recommendations": recommendations,
        "thresholds": thresholds(),
        "module_totals": {module: round(value, 1) for module, value in capped.items()},
        "engine_version": ENGINE_VERSION,
        "ml_enabled": _ml_scorer is not None,
        "disclaimer": DISCLAIMER,
    }
