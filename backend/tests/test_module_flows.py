"""Industrial intelligence and public safety module flows."""

from tests.conftest import register_user, upload_document

VENDOR = "Orion Precision Tools Pvt Ltd"
INVOICE_LINES = [
    f"Vendor: {VENDOR}",
    "GSTIN: 29ABCDE1234F1ZW",
    "Invoice No: INV-2026-0921",
    "Invoice Date: 20 Nov 2026",
    "PO Number: PO-2026-0921",
    "Buyer: Sunrise Manufacturing Pvt Ltd",
    "Bank Account: 50100234567890",
    "IFSC: HDFC0001234",
    "Subtotal: 100000.00",
    "GST (18%): 18000.00",
    "Total: 118000.00",
]
PO_LINES = [
    f"Vendor: {VENDOR}",
    "Purchase Order: PO-2026-0921",
    "PO Number: PO-2026-0921",
    "Order Date: 18 Nov 2026",
    "Buyer: Sunrise Manufacturing Pvt Ltd",
    "Total: 118000.00",
]
OFFER_LETTER_LINES = [
    "OFFER OF EMPLOYMENT",
    "Candidate: Priya Sharma",
    "Aadhaar: 5123 4567 8903   PAN: ABCDE1234F",
    "Bank Account: 50100234567890   IFSC: HDFC0001234",
    "Contact: +91 98765 43210   Email: hr@example.com",
    "Salary: 45,000 per month",
]


def test_industrial_suppliers_po_check_and_expiry(client):
    headers, _ = register_user(client, "factory@example.com", "industrial")

    created = client.post("/api/industrial/suppliers", json={
        "name": VENDOR,
        "gstin": "29ABCDE1234F1ZW",
        "email": "accounts@orion.example",
        "bank_account": "50100234567890",
        "ifsc": "HDFC0001234",
    }, headers=headers)
    assert created.status_code == 201
    supplier = created.get_json()["data"]["supplier"]
    assert supplier["status"] in ("pending", "review_required", "verified")
    assert isinstance(created.get_json()["data"]["warnings"], list)

    listed = client.get("/api/industrial/suppliers", headers=headers)
    assert listed.status_code == 200
    assert any(row["id"] == supplier["id"] for row in listed.get_json()["data"]["suppliers"])

    invoice = upload_document(client, headers, INVOICE_LINES, doc_kind="invoice", portal="industrial", filename="invoice.pdf")
    po = upload_document(client, headers, PO_LINES, doc_kind="purchase_order", portal="industrial", filename="po.pdf")

    check = client.post("/api/industrial/po-check", json={
        "invoice_id": invoice["document"]["id"],
        "po_id": po["document"]["id"],
    }, headers=headers)
    assert check.status_code == 200
    checks = {row["code"]: row for row in check.get_json()["data"]["checks"]}
    assert checks["po_number_match"]["status"] == "passed"
    assert checks["po_amount_match"]["status"] == "passed"
    assert "confirm against the original PO" in check.get_json()["data"]["note"]

    verify = client.post(f"/api/industrial/suppliers/{supplier['id']}/verify", json={
        "document_id": invoice["document"]["id"],
    }, headers=headers)
    assert verify.status_code == 200
    verification = verify.get_json()["data"]
    assert 0 <= verification["match_ratio"] <= 1
    assert verification["status"] in ("verified", "review_required", "flagged")

    dashboard = client.get("/api/industrial/dashboard", headers=headers)
    assert dashboard.status_code == 200
    assert dashboard.get_json()["data"]["counts"]["total_documents"] >= 2

    expiry = client.get("/api/industrial/expiry-alerts?days=60", headers=headers)
    assert expiry.status_code == 200
    assert "expired" in expiry.get_json()["data"]
    assert "not the only source" in (expiry.get_json()["data"].get("note") or "").lower() or expiry.get_json()["data"]["note"]


def test_public_safety_pii_redaction_and_reporting(client):
    headers, _ = register_user(client, "citizen-safety@example.com", "public")
    uploaded = upload_document(client, headers, OFFER_LETTER_LINES, doc_kind="offer_letter", portal="public")
    document_id = uploaded["document"]["id"]

    scan = client.get(f"/api/public/documents/{document_id}/pii", headers=headers)
    assert scan.status_code == 200
    detections = scan.get_json()["data"]["detections"]
    types = {row["type"] for row in detections}
    assert "aadhaar" in types
    assert "pan" in types
    assert all(row.get("masked") for row in detections), "API exposes masked values only"

    redact = client.post(f"/api/public/documents/{document_id}/redact", json={"types": ["aadhaar", "pan"]}, headers=headers)
    assert redact.status_code == 200
    redaction = redact.get_json()["data"]
    assert redaction["detection_count"] >= 2
    assert redaction["preview_url"].endswith("variant=redacted")

    redacted_text = client.get(f"/api/public/documents/{document_id}/redacted-text", headers=headers)
    assert redacted_text.status_code == 200
    assert redacted_text.headers["Content-Type"].startswith("text/plain")
    assert b"ABCDE1234F" not in redacted_text.data

    reported = client.post("/api/public/reports", json={
        "document_id": document_id,
        "reason": "Fake offer letter",
        "description": "Asked for an Aadhaar copy before any interview.",
    }, headers=headers)
    assert reported.status_code == 201

    reports = client.get("/api/public/reports", headers=headers)
    assert reports.status_code == 200
    assert reports.get_json()["data"]["reports"], "submitted report should be listed"

    foreign = register_user(client, "unrelated@example.com", "public")[0]
    assert client.get(f"/api/public/documents/{document_id}/pii", headers=foreign).status_code == 404
