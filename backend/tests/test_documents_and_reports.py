"""End-to-end document, verification and reporting flows."""

from tests.conftest import register_user, upload_document

INVOICE_LINES = [
    "Vendor: Orion Precision Tools Pvt Ltd",
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


def test_document_upload_analysis_and_access_isolation(client):
    owner, _ = register_user(client, "owner@example.com", "public")
    intruder, _ = register_user(client, "intruder@example.com", "public")

    data = upload_document(client, owner, INVOICE_LINES, doc_kind="offer_letter", portal="public")
    document = data["document"]
    assert data["analysis_error"] is None
    assert document["status"] == "analysed"

    detail = client.get(f"/api/documents/{document['id']}", headers=owner)
    assert detail.status_code == 200
    payload = detail.get_json()["data"]
    assert payload["id"] == document["id"]
    assert payload["risk"], "risk assessment should exist after analysis"
    assert payload["tampering"], "forensic region summary should exist after analysis"
    assert payload["checks"], "verification checks should exist after analysis"

    preview = client.get(f"/api/documents/{document['id']}/preview", headers=owner)
    assert preview.status_code == 200
    assert preview.headers["Cache-Control"] == "no-store"

    hidden = client.get(f"/api/documents/{document['id']}", headers=intruder)
    assert hidden.status_code == 404
    hidden_preview = client.get(f"/api/documents/{document['id']}/preview", headers=intruder)
    assert hidden_preview.status_code == 404
    delete = client.delete(f"/api/documents/{document['id']}", headers=intruder)
    assert delete.status_code == 404


def test_offline_verification_validators(client):
    headers, _ = register_user(client, "validator@example.com", "public")

    response = client.post("/api/verification/validate", json={
        "gstin": "29ABCDE1234F1ZW",
        "pan": "ABCDE1234F",
        "ifsc": "HDFC0001234",
        "bank_account": "50100234567890",
    }, headers=headers)
    assert response.status_code == 200
    results = response.get_json()["data"]["results"]
    assert results["gstin"]["valid"] is True
    assert results["pan"]["valid"] is True
    assert results["ifsc"]["valid"] is True
    assert "no government or bank lookup" in response.get_json()["data"]["note"].lower()

    bad = client.post("/api/verification/validate", json={"gstin": "29ABCDE1234F1ZZ"}, headers=headers)
    assert bad.get_json()["data"]["results"]["gstin"]["valid"] is False


def test_report_share_link_lifecycle(client):
    headers, _ = register_user(client, "reporter@example.com", "public")
    data = upload_document(client, headers, INVOICE_LINES, doc_kind="offer_letter", portal="public")
    document_id = data["document"]["id"]

    created = client.post("/api/reports", json={"document_id": document_id}, headers=headers)
    assert created.status_code == 201
    report_payload = created.get_json()["data"]
    token = report_payload["share_url"].rstrip("/").split("/")[-1]
    report_id = report_payload["report"]["id"]

    public = client.get(f"/api/reports/public/{token}")
    assert public.status_code == 200
    public_data = public.get_json()["data"]
    assert public_data["valid"] is True
    assert public_data["document"]["dna_prefix"]
    assert "not calibrated fraud probabilities" in (public_data["disclaimer"] or "").lower()
    assert public_data["notice"]

    qr = client.get(f"/api/reports/{report_id}/qr", headers=headers)
    assert qr.status_code == 200
    assert qr.headers["Content-Type"].startswith("image/png")

    pdf = client.get(f"/api/reports/{report_id}/download", headers=headers)
    assert pdf.status_code == 200
    assert pdf.headers["Content-Type"] == "application/pdf"

    revoked = client.post(f"/api/reports/{report_id}/revoke", headers=headers)
    assert revoked.status_code == 200

    after = client.get(f"/api/reports/public/{token}")
    assert after.status_code == 200
    assert after.get_json()["data"]["valid"] is False


def test_document_comparison(client):
    headers, _ = register_user(client, "compare@example.com", "public")
    left = upload_document(client, headers, INVOICE_LINES, doc_kind="offer_letter", portal="public", filename="left.pdf")
    altered = list(INVOICE_LINES)
    altered[-1] = "Total: 218000.00"
    right = upload_document(client, headers, altered, doc_kind="offer_letter", portal="public", filename="right.pdf")

    response = client.post("/api/verification/compare", json={
        "left_id": left["document"]["id"],
        "right_id": right["document"]["id"],
    }, headers=headers)
    assert response.status_code == 200
    data = response.get_json()["data"]
    assert 0 <= data["text_similarity"] <= 1
    assert data["fields"], "field comparison should be produced"
    assert "note" in data

    history = client.get("/api/verification/comparisons", headers=headers)
    assert history.status_code == 200
