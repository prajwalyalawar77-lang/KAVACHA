"""Fraud intelligence: duplicate detection, repeated identifiers, anomaly
scanning, supplier risk profiling and a relationship graph.

Nothing here labels a person or supplier as fraudulent. Alerts are investigative
leads with explicit evidence and a confidence-oriented description.
"""

import statistics
from datetime import timedelta

from app.constants import ALERT_OPEN, SUPPLIER_FLAGGED, SUPPLIER_PENDING, SUPPLIER_REVIEW, SUPPLIER_VERIFIED
from app.extensions import db
from app.models import (
    Document,
    DocumentFingerprint,
    FraudAlert,
    Invoice,
    Supplier,
    VerificationResult,
)
from app.utils.files import hamming
from app.utils.text import json_safe, normalize_name
from app.utils.time import iso, utcnow

SEVERITY_RISK_WEIGHT = {"critical": 18, "high": 14, "medium": 8, "low": 4, "info": 0}


def _scope(model, org_id, owner_id):
    query = db.select(model)
    if org_id:
        query = query.where(model.organisation_id == org_id)
    else:
        query = query.where(model.owner_id == owner_id)
    return query


def find_supplier(org_id: int | None, gstin: str | None, vendor_name: str | None) -> Supplier | None:
    if not org_id:
        return None
    if gstin:
        supplier = db.session.scalars(
            db.select(Supplier).where(Supplier.organisation_id == org_id,
                                      db.func.upper(Supplier.gstin) == gstin.upper())
        ).first()
        if supplier:
            return supplier
    if vendor_name:
        normalized = normalize_name(vendor_name)
        if normalized:
            supplier = db.session.scalars(
                db.select(Supplier).where(Supplier.organisation_id == org_id,
                                          Supplier.normalized_name == normalized)
            ).first()
            if supplier:
                return supplier
    return None


def _upsert_alert(alert_type, severity, title, description, document, evidence,
                  supplier_id=None, org_id=None) -> FraudAlert:
    existing = db.session.scalars(
        db.select(FraudAlert).where(
            FraudAlert.document_id == document.id,
            FraudAlert.alert_type == alert_type,
            FraudAlert.status == ALERT_OPEN,
        )
    ).first()
    if existing:
        existing.severity = severity
        existing.title = title
        existing.description = description
        existing.evidence_json = json_safe(evidence)
        existing.supplier_id = supplier_id
        return existing
    alert = FraudAlert(
        organisation_id=org_id if org_id is not None else document.organisation_id,
        document_id=document.id,
        supplier_id=supplier_id,
        alert_type=alert_type,
        severity=severity,
        title=title,
        description=description,
        evidence_json=json_safe(evidence),
        status=ALERT_OPEN,
    )
    db.session.add(alert)
    return alert


def scan_document(document, fields: dict, supplier: Supplier | None = None) -> dict:
    org_id = document.organisation_id
    owner_id = document.owner_id
    result = {
        "exact_duplicates": [],
        "near_duplicates": [],
        "duplicate_invoices": [],
        "shared_bank_account": [],
        "shared_gstin": [],
        "amount_anomaly": None,
        "alerts": [],
        "linked_supplier_id": supplier.id if supplier else None,
    }

    duplicate_query = db.select(Document).where(
        Document.id != document.id,
        Document.deleted_at.is_(None),
        Document.sha256 == document.sha256,
    )
    if org_id:
        duplicate_query = duplicate_query.where(Document.organisation_id == org_id)
    else:
        duplicate_query = duplicate_query.where(Document.owner_id == owner_id)
    exact = db.session.scalars(duplicate_query.limit(5)).all()
    if exact:
        result["exact_duplicates"] = [
            {"id": d.id, "name": d.original_filename, "created_at": iso(d.created_at)} for d in exact
        ]
        alert = _upsert_alert(
            "duplicate_document", "high", "Exact duplicate document detected",
            f"This file is byte-identical (SHA-256) to {len(exact)} other document(s) in this workspace. "
            "Duplicate submissions can be legitimate (re-uploads) or an indicator of invoice recycling.",
            document,
            {"sha256": document.sha256, "duplicates": result["exact_duplicates"]},
            supplier_id=supplier.id if supplier else None,
        )
        result["alerts"].append(alert)

    if document.fingerprint and document.fingerprint.dhash:
        candidate_query = (
            db.select(Document, DocumentFingerprint)
            .join(DocumentFingerprint, DocumentFingerprint.document_id == Document.id)
            .where(Document.id != document.id, Document.deleted_at.is_(None),
                   Document.sha256 != document.sha256)
        )
        if org_id:
            candidate_query = candidate_query.where(Document.organisation_id == org_id)
        else:
            candidate_query = candidate_query.where(Document.owner_id == owner_id)
        candidate_query = candidate_query.where(Document.doc_kind == document.doc_kind)
        for other, fingerprint in db.session.execute(candidate_query.limit(300)).all():
            distance = hamming(document.fingerprint.dhash, fingerprint.dhash)
            if distance <= 6:
                result["near_duplicates"].append({
                    "id": other.id,
                    "name": other.original_filename,
                    "distance": distance,
                    "created_at": iso(other.created_at),
                })
        result["near_duplicates"] = sorted(result["near_duplicates"], key=lambda x: x["distance"])[:5]
        if result["near_duplicates"]:
            alert = _upsert_alert(
                "near_duplicate_document", "medium", "Visually similar document detected",
                f"{len(result['near_duplicates'])} document(s) of the same type have near-identical perceptual "
                "hashes (dHash distance ≤ 6). This can indicate a re-submitted or lightly edited copy; "
                "it can also match templates and repeated statements.",
                document,
                {"matches": result["near_duplicates"]},
                supplier_id=supplier.id if supplier else None,
            )
            result["alerts"].append(alert)

    normalized_number = fields.get("normalized_invoice_number")
    if normalized_number:
        invoice_query = (
            db.select(Invoice, Document)
            .join(Document, Invoice.document_id == Document.id)
            .where(Invoice.normalized_number == normalized_number,
                   Invoice.document_id != document.id,
                   Document.deleted_at.is_(None))
        )
        if org_id:
            invoice_query = invoice_query.where(Invoice.organisation_id == org_id)
        else:
            invoice_query = invoice_query.join(Supplier, isouter=True).where(Document.owner_id == owner_id)
        matches = db.session.execute(invoice_query.limit(6)).all()
        if matches:
            result["duplicate_invoices"] = [
                {
                    "id": invoice.id,
                    "invoice_number": invoice.invoice_number,
                    "document_id": other.id,
                    "document_name": other.original_filename,
                    "supplier_id": invoice.supplier_id,
                }
                for invoice, other in matches
            ]
            same_supplier = supplier and any(m["supplier_id"] == supplier.id for m in result["duplicate_invoices"])
            alert = _upsert_alert(
                "repeated_invoice_number",
                "high" if not same_supplier else "medium",
                "Repeated invoice number detected",
                f"Invoice number '{fields.get('invoice_number') or normalized_number}' also appears in "
                f"{len(matches)} other document(s)"
                + (" from the same supplier. Check whether it is a duplicate claim or a mis-numbered invoice."
                   if same_supplier else " under different supplier links. Repeated numbers across suppliers are a stronger lead."),
                document,
                {"invoice_number": normalized_number, "matches": result["duplicate_invoices"]},
                supplier_id=supplier.id if supplier else None,
            )
            result["alerts"].append(alert)

    bank_account = (fields.get("bank_account") or "").replace(" ", "")
    gstin = (fields.get("gstin") or "").upper()
    if org_id and (bank_account or gstin):
        suppliers = db.session.scalars(
            db.select(Supplier).where(Supplier.organisation_id == org_id)
        ).all()
        if bank_account:
            shared = [s for s in suppliers
                      if s.bank_account and s.bank_account.replace(" ", "") == bank_account
                      and (not supplier or s.id != supplier.id)]
            if shared:
                result["shared_bank_account"] = [s.to_dict() for s in shared[:5]]
                alert = _upsert_alert(
                    "shared_bank_account", "medium", "Bank account shared by multiple suppliers",
                    f"{len(shared)} other supplier profile(s) in your organisation use the same bank account. "
                    "Shared settlement accounts can be legitimate for group entities but are a common "
                    "payment-diversion indicator — verify with the supplier independently.",
                    document,
                    {"bank_account_last4": bank_account[-4:], "suppliers": [s.name for s in shared[:5]]},
                    supplier_id=supplier.id if supplier else None,
                )
                result["alerts"].append(alert)
        if gstin:
            shared_gstin = [s for s in suppliers
                            if s.gstin and s.gstin.upper() == gstin and (not supplier or s.id != supplier.id)]
            if shared_gstin:
                result["shared_gstin"] = [s.to_dict() for s in shared_gstin[:5]]
                alert = _upsert_alert(
                    "shared_gstin", "medium", "GSTIN used by multiple supplier profiles",
                    f"{len(shared_gstin)} other supplier profile(s) share the same GSTIN. "
                    "This may be a group registration or a supplier onboarding error — confirm the legal entity.",
                    document,
                    {"gstin": gstin, "suppliers": [s.name for s in shared_gstin[:5]]},
                    supplier_id=supplier.id if supplier else None,
                )
                result["alerts"].append(alert)

    current_total = (fields.get("amounts") or {}).get("total")
    if current_total and org_id:
        invoice_rows = db.session.execute(
            db.select(Invoice).where(Invoice.organisation_id == org_id,
                                     Invoice.document_id != document.id,
                                     Invoice.total_amount.is_not(None))
        ).scalars().all()
        totals = [float(inv.total_amount) for inv in invoice_rows if inv.total_amount is not None]
        if len(totals) >= 3 and current_total > 0:
            median = statistics.median(totals)
            deviations = [abs(value - median) for value in totals]
            mad = statistics.median(deviations) or 0.0
            robust_z = (abs(current_total - median) / (1.4826 * mad)) if mad > 0 else 0.0
            if current_total > median * 1.8 and robust_z > 3.5:
                result["amount_anomaly"] = {
                    "current_total": current_total,
                    "median_total": round(median, 2),
                    "robust_z": round(robust_z, 2),
                    "sample_size": len(totals),
                }
                alert = _upsert_alert(
                    "invoice_amount_outlier", "low", "Invoice amount is a statistical outlier",
                    f"The invoice total ({current_total:,.2f}) is well above the typical invoice amount in this "
                    f"workspace (median {median:,.2f}, robust z={robust_z:.1f}). This is an anomaly indicator only; "
                    "large legitimate orders are common.",
                    document,
                    result["amount_anomaly"],
                    supplier_id=supplier.id if supplier else None,
                )
                result["alerts"].append(alert)

    return result


def _alert_weight(alert) -> int:
    return SEVERITY_RISK_WEIGHT.get(alert.severity, 4)


def compute_supplier_profile(supplier: Supplier, persist: bool = False) -> dict:
    invoices = db.session.scalars(
        db.select(Invoice).where(Invoice.supplier_id == supplier.id)
    ).all()
    document_ids = [invoice.document_id for invoice in invoices]
    documents = db.session.scalars(
        db.select(Document).where(Document.id.in_(document_ids))
    ).all() if document_ids else []
    alerts = db.session.scalars(
        db.select(FraudAlert).where(FraudAlert.supplier_id == supplier.id)
    ).all()
    failed_checks = db.session.execute(
        db.select(VerificationResult).where(
            VerificationResult.document_id.in_(document_ids),
            VerificationResult.status == "failed",
        )
    ).scalars().all() if document_ids else []
    risk = 0.0
    flags = []
    if documents:
        avg_risk = sum((doc.risk_assessment.score if doc.risk_assessment else 0) for doc in documents) / len(documents)
        if avg_risk >= 60:
            risk += min(30, avg_risk * 0.35)
            flags.append({"code": "high_avg_document_risk", "label": f"Average document risk {avg_risk:.0f}/100"})
        elif avg_risk >= 35:
            risk += 12
            flags.append({"code": "elevated_avg_document_risk", "label": f"Average document risk {avg_risk:.0f}/100"})
        critical_docs = [doc for doc in documents if doc.risk_assessment and doc.risk_assessment.category == "critical"]
        if critical_docs:
            risk += min(20, 8 * len(critical_docs))
            flags.append({"code": "critical_documents", "label": f"{len(critical_docs)} critical-risk document(s)"})
        expired = [doc for doc in documents if doc.expiry_date and doc.expiry_date < utcnow().date()]
        if expired:
            risk += 12
            flags.append({"code": "expired_documents", "label": f"{len(expired)} expired document(s)"})
    if failed_checks:
        risk += min(20, 2.5 * len(failed_checks))
        flags.append({"code": "failed_checks", "label": f"{len(failed_checks)} failed verification check(s)"})
    open_alerts = [alert for alert in alerts if alert.status == ALERT_OPEN]
    if open_alerts:
        risk += min(30, sum(_alert_weight(a) for a in open_alerts))
        flags.append({"code": "open_alerts", "label": f"{len(open_alerts)} open fraud-intelligence alert(s)"})
    duplicate_invoices = [a for a in open_alerts if a.alert_type == "repeated_invoice_number"]
    if duplicate_invoices:
        flags.append({"code": "duplicate_invoice", "label": "Repeated invoice number found"})
    shared = db.session.scalars(
        db.select(Supplier).where(
            Supplier.organisation_id == supplier.organisation_id,
            Supplier.id != supplier.id,
            db.or_(
                Supplier.bank_account == supplier.bank_account if supplier.bank_account else db.false(),
                db.func.upper(Supplier.gstin) == supplier.gstin.upper() if supplier.gstin else db.false(),
            ),
        )
    ).all() if (supplier.bank_account or supplier.gstin) else []
    if shared:
        risk += 10
        flags.append({"code": "shared_identifiers", "label": f"Shares bank/GSTIN with {len(shared)} other supplier(s)"})

    risk = round(min(100.0, risk), 1)
    if documents and risk >= 65:
        status = SUPPLIER_FLAGGED
    elif risk >= 40:
        status = SUPPLIER_REVIEW
    elif documents:
        status = SUPPLIER_VERIFIED
    else:
        status = SUPPLIER_PENDING
    trust = round(max(0.0, 100.0 - risk), 1)
    totals = [float(inv.total_amount) for inv in invoices if inv.total_amount is not None]
    profile = {
        "supplier": supplier.to_dict(),
        "risk_score": risk,
        "trust_score": trust,
        "status": status,
        "flags": flags,
        "document_count": len(documents),
        "invoice_count": len(invoices),
        "invoice_total": round(sum(totals), 2) if totals else 0,
        "average_invoice": round(sum(totals) / len(totals), 2) if totals else 0,
        "alert_count": len(open_alerts),
        "failed_check_count": len(failed_checks),
        "documents": [{"id": d.id, "name": d.original_filename,
                       "risk": d.risk_assessment.score if d.risk_assessment else None,
                       "created_at": iso(d.created_at)} for d in sorted(documents, key=lambda x: x.created_at, reverse=True)[:10]],
        "alerts": [a.to_dict() for a in open_alerts[:10]],
        "disclaimer": "Supplier trust profiling is heuristic and evidence-based; it is not an accusation of fraud.",
    }
    if persist:
        supplier.trust_score = trust
        supplier.status = status
        supplier.risk_summary = "; ".join(flag["label"] for flag in flags) or "No elevated indicators detected."
        supplier.last_verified_at = utcnow()
    return profile


def build_graph(org_id: int | None = None, limit_docs: int = 30) -> dict:
    nodes: dict[str, dict] = {}
    edges: list[dict] = []

    def add_node(node_id, node_type, label, risk=None, meta=None):
        if node_id in nodes:
            return
        nodes[node_id] = {"id": node_id, "type": node_type, "label": label,
                          "risk": risk, "meta": meta or {}}

    def add_edge(source, target, relation, weight=1, label=None):
        key = (source, target, relation)
        if any((e["source"], e["target"], e["relation"]) == key for e in edges):
            return
        edges.append({"source": source, "target": target, "relation": relation,
                      "weight": weight, "label": label or relation})

    supplier_query = db.select(Supplier)
    document_query = db.select(Document).where(Document.deleted_at.is_(None))
    invoice_query = db.select(Invoice)
    alert_query = db.select(FraudAlert).where(FraudAlert.status == ALERT_OPEN)
    if org_id:
        supplier_query = supplier_query.where(Supplier.organisation_id == org_id)
        document_query = document_query.where(Document.organisation_id == org_id)
        invoice_query = invoice_query.where(Invoice.organisation_id == org_id)
        alert_query = alert_query.where(FraudAlert.organisation_id == org_id)

    suppliers = db.session.scalars(supplier_query.limit(40)).all()
    documents = db.session.scalars(document_query.order_by(Document.created_at.desc()).limit(limit_docs)).all()
    document_ids = {doc.id for doc in documents}
    invoices = [inv for inv in db.session.scalars(invoice_query.limit(120)).all()
                if inv.document_id in document_ids or not document_ids]
    alerts = db.session.scalars(alert_query.limit(60)).all()

    org_ids = {s.organisation_id for s in suppliers if s.organisation_id}
    for use_org in org_ids:
        add_node(f"org:{use_org}", "organisation", f"Organisation #{use_org}", meta={})

    for supplier in suppliers:
        risk = None
        if supplier.trust_score is not None:
            risk = round(max(0, 100 - supplier.trust_score), 1)
        add_node(f"supplier:{supplier.id}", "supplier", supplier.name, risk,
                 {"status": supplier.status, "trust_score": supplier.trust_score, "gstin": supplier.gstin})
        if supplier.organisation_id:
            add_edge(f"org:{supplier.organisation_id}", f"supplier:{supplier.id}", "has_supplier")
        if supplier.bank_account:
            bank_id = f"bank:{supplier.bank_account.replace(' ', '')}"
            add_node(bank_id, "bank_account", "A/C ••••" + supplier.bank_account[-4:], meta={"ifsc": supplier.ifsc})
            add_edge(f"supplier:{supplier.id}", bank_id, "settles_to")
        if supplier.gstin:
            gstin_id = f"gstin:{supplier.gstin.upper()}"
            add_node(gstin_id, "gstin", supplier.gstin.upper())
            add_edge(f"supplier:{supplier.id}", gstin_id, "registered_as")

    for invoice in invoices:
        label = invoice.invoice_number or f"Invoice #{invoice.id}"
        add_node(f"invoice:{invoice.id}", "invoice", label,
                 meta={"total": float(invoice.total_amount) if invoice.total_amount is not None else None,
                       "date": iso(invoice.invoice_date), "doc_kind": "invoice"})
        if invoice.supplier_id:
            add_edge(f"supplier:{invoice.supplier_id}", f"invoice:{invoice.id}", "issued")
        if invoice.document_id:
            add_edge(f"invoice:{invoice.id}", f"doc:{invoice.document_id}", "recorded_in")
        if invoice.gstin:
            gstin_id = f"gstin:{invoice.gstin.upper()}"
            add_node(gstin_id, "gstin", invoice.gstin.upper())
            add_edge(f"invoice:{invoice.id}", gstin_id, "billed_under")

    for document in documents:
        risk = document.risk_assessment.score if document.risk_assessment else None
        add_node(f"doc:{document.id}", "document", document.original_filename, risk,
                 {"kind": document.doc_kind, "status": document.status, "created_at": iso(document.created_at)})
        if document.organisation_id:
            add_edge(f"org:{document.organisation_id}", f"doc:{document.id}", "contains")

    for alert in alerts:
        if alert.document_id and f"doc:{alert.document_id}" in nodes:
            add_node(f"alert:{alert.id}", "alert", alert.title, meta={"severity": alert.severity,
                                                                      "type": alert.alert_type})
            add_edge(f"doc:{alert.document_id}", f"alert:{alert.id}", "raised", weight=2)

    stats = {
        "suppliers": len(suppliers),
        "documents": len(documents),
        "invoices": len(invoices),
        "alerts": len(alerts),
        "shared_banks": sum(1 for node in nodes.values() if node["type"] == "bank_account"
                            and sum(1 for e in edges if e["target"] == node["id"] and e["relation"] == "settles_to") > 1),
        "shared_gstins": sum(1 for node in nodes.values() if node["type"] == "gstin"
                             and sum(1 for e in edges if e["target"] == node["id"] and e["relation"] in ("registered_as",)) > 1),
    }
    return {
        "nodes": list(nodes.values()),
        "edges": edges,
        "stats": stats,
        "disclaimer": "Connections are derived from submitted documents and onboarded supplier records. "
                      "A shared identifier is a lead for investigation, not proof of fraud.",
    }


def fraud_overview(org_id: int | None, owner_id: int | None) -> dict:
    doc_query = db.select(Document).where(Document.deleted_at.is_(None))
    alert_query = db.select(FraudAlert)
    if org_id:
        doc_query = doc_query.where(Document.organisation_id == org_id)
        alert_query = alert_query.where(FraudAlert.organisation_id == org_id)
    else:
        doc_query = doc_query.where(Document.owner_id == owner_id)
        alert_query = alert_query.join(Document, FraudAlert.document_id == Document.id).where(
            Document.owner_id == owner_id)
    documents = db.session.scalars(doc_query.order_by(Document.created_at.desc()).limit(500)).all()
    alerts = db.session.scalars(alert_query.order_by(FraudAlert.created_at.desc()).limit(100)).all()
    risk_counts = {"low": 0, "medium": 0, "high": 0, "critical": 0, "unassessed": 0}
    for document in documents:
        if document.risk_assessment:
            risk_counts[document.risk_assessment.category] = risk_counts.get(document.risk_assessment.category, 0) + 1
        else:
            risk_counts["unassessed"] += 1
    monthly = {}
    months = []
    now = utcnow()
    for offset in range(5, -1, -1):
        year = now.year
        month = now.month - offset
        while month <= 0:
            month += 12
            year -= 1
        key = f"{year}-{month:02d}"
        months.append(key)
        monthly[key] = {"month": key, "documents": 0, "high_risk": 0, "alerts": 0}
    for document in documents:
        key = document.created_at.strftime("%Y-%m")
        if key in monthly:
            monthly[key]["documents"] += 1
            if document.risk_assessment and document.risk_assessment.category in ("high", "critical"):
                monthly[key]["high_risk"] += 1
    for alert in alerts:
        key = alert.created_at.strftime("%Y-%m")
        if key in monthly:
            monthly[key]["alerts"] += 1
    severity_counts = {}
    type_counts = {}
    for alert in alerts:
        severity_counts[alert.severity] = severity_counts.get(alert.severity, 0) + 1
        type_counts[alert.alert_type] = type_counts.get(alert.alert_type, 0) + 1
    supplier_stats = {"total": 0, "pending": 0, "verified": 0, "review_required": 0, "flagged": 0}
    if org_id:
        suppliers = db.session.scalars(db.select(Supplier).where(Supplier.organisation_id == org_id)).all()
        supplier_stats["total"] = len(suppliers)
        for supplier in suppliers:
            supplier_stats[supplier.status] = supplier_stats.get(supplier.status, 0) + 1
    duplicate_docs = [a for a in alerts if a.status == ALERT_OPEN and a.alert_type in
                      ("duplicate_document", "near_duplicate_document")]
    top_documents = sorted(
        [d for d in documents if d.risk_assessment],
        key=lambda d: d.risk_assessment.score, reverse=True,
    )[:5]
    return {
        "counts": {
            "documents": len(documents),
            "analysed": sum(1 for d in documents if d.status == "analysed"),
            "open_alerts": sum(1 for a in alerts if a.status == ALERT_OPEN),
            "duplicate_flags": len(duplicate_docs),
        },
        "risk_distribution": risk_counts,
        "alerts_by_severity": severity_counts,
        "alerts_by_type": type_counts,
        "supplier_status": supplier_stats,
        "monthly": [monthly[key] for key in months],
        "recent_alerts": [a.to_dict() for a in alerts[:8]],
        "top_documents": [d.to_dict() for d in top_documents],
        "disclaimer": "Alerts and anomalies are investigative indicators generated from submitted data. "
                      "They do not establish fraud or intent.",
    }


def rescan_organisation(org_id: int) -> dict:
    invoices = db.session.scalars(db.select(Invoice).where(Invoice.organisation_id == org_id)).all()
    grouped: dict[str, list[Invoice]] = {}
    for invoice in invoices:
        if invoice.normalized_number:
            grouped.setdefault(invoice.normalized_number, []).append(invoice)
    duplicates = 0
    for number, items in grouped.items():
        if len(items) < 2:
            continue
        duplicates += 1
        for invoice in items:
            document = invoice.document
            if not document:
                continue
            supplier = invoice.supplier
            others = [i for i in items if i.id != invoice.id]
            _upsert_alert(
                "repeated_invoice_number", "medium", "Repeated invoice number detected",
                f"Invoice number '{invoice.invoice_number}' appears in {len(items)} documents in this workspace. "
                "Rescan result — review for duplicate claims or mis-numbering.",
                document,
                {"invoice_number": number, "document_ids": [i.document_id for i in others][:8]},
                supplier_id=supplier.id if supplier else None,
            )
    db.session.commit()
    return {"duplicate_groups": duplicates, "invoices_scanned": len(invoices)}
