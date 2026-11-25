# Testing guide

## Prerequisites

- Backend dependencies installed (`pip install -r backend/requirements.txt`).
- No running server is required for pytest; tests use an in-memory SQLite database and a test storage root.
- Tesseract is optional: PDFs with a text layer analyse without it. If Tesseract or the `kan` pack is missing, checks are reported as skipped/degraded, never fabricated.

## Automated tests

```bash
cd backend
python -m pytest tests -q          # quiet run
python -m pytest tests -v          # verbose
python -m pytest tests -k report   # subset
```

Expected: **10 passed** in roughly 30 seconds on a typical laptop.

### What is covered

| File | Coverage |
|---|---|
| `tests/conftest.py` | App factory with `TestConfig`, schema reset, rate-limit reset, PDF generator, registration/upload helpers |
| `tests/test_auth_and_permissions.py` | Health/meta, registration + duplicate email, bad-login `invalid_credentials`, profile/password changes, anonymous 401s, public user blocked from industrial/admin APIs |
| `tests/test_documents_and_reports.py` | Upload → analysis → detail/preview, `Cache-Control: no-store`, cross-user isolation (404), offline validators, report creation/public token/QR/PDF/revocation, two-document comparison |
| `tests/test_module_flows.py` | Industrial supplier onboarding + warnings, invoice ↔ PO checks, supplier verification, expiry endpoints, PII detection (masked), redaction + redacted text, suspicious-document reporting, cross-user PII isolation |

### Test environment notes

- `TestConfig` uses `sqlite://` with a static pool; storage goes to `storage/_test/` (git-ignored).
- Rate limits are cleared before each test.
- Analysis runs synchronously inside the upload request, so tests exercise the real pipeline (OpenCV, PyMuPDF, Tesseract when available).
- Temporary files created in `storage/_test/` can be deleted safely.

## Manual end-to-end checklist

Start backend (`flask run`) and frontend (`npm run dev`), then:

1. **Landing → register** a new public account; confirm validation messages and redirect to role selection.
2. **Dashboard** shows role-aware KPIs and charts after sign-in.
3. **Upload** an offer letter / invoice with *automatic analysis*; the result card links to analysis, forensics and verification.
4. **Analysis** page: risk score with band, evidence list, confidence, checks table, extracted fields, alerts, DNA.
5. **Forensic viewer**: LEFT original, RIGHT analysed overlay with numbered regions, BOTTOM findings + risk. Limitations note is visible.
6. **Verification page**: run the identifier validator (valid and invalid GSTIN); compare two documents and review field/metadata differences and the "indicative only" wording.
7. **Risk page**: thresholds panel (admin can edit), signal weights, recommendations.
8. **Fraud intelligence**: graph, alert queue (acknowledge/dismiss), duplicate flags; run invoice rescan.
9. **Industrial portal** (industrial account): PO check between the demo invoice and PO; expiry scan; confirm the "not proof of PO existence" note.
10. **Suppliers**: create a supplier (invalid GSTIN produces a warning), verify against a document, refresh profile.
11. **Public safety**: scan PII, redact Aadhaar/PAN, download the redacted text, submit a suspicious-document report.
12. **Reports**: generate a report, open the share link in a private window, download the PDF/QR, revoke and confirm the public page reports the link as invalid.
13. **Admin** (admin account): change a user role, deactivate/reactivate, inspect organisations, filter audit logs.
14. **Settings**: update profile, retention slider, organisation profile; attempt an industrial-only action as a public user and confirm the server returns 403.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `The KAVACHA API is unreachable` | Flask not running or wrong port; Vite proxy expects `127.0.0.1:5000` (override with `VITE_API_PROXY`) |
| Analysis status `failed` / OCR skipped | Tesseract missing or language pack absent; check `/api/health` → `ocr.installed_languages` and `/api/meta` → `ocr` |
| Kannada text not recognised | Install the Tesseract `kan` language pack; the API reports the fallback explicitly |
| `413 file_too_large` | Raise `MAX_UPLOAD_MB` and restart |
| `429 rate_limited` | Wait for the `Retry-After` window or raise `AUTH_RATE_LIMIT`/`API_RATE_LIMIT` |
| Preview/QR/PDF 404 | The file may be missing on disk; regenerate the artefact/report. Paths are storage-relative and resolved safely |
| Tests fail with storage permission errors | Ensure the project directory is writable, or set `TEST_STORAGE_ROOT` to a temp path |
| `npm` not found in this sandboxed shell | Use the system Node install or a portable Node directory on `PATH` |

## What the tests intentionally do **not** assert

- Calibrated fraud probabilities (scores are configurable demonstration thresholds).
- External GST/bank/government verification (not performed unless configured).
- OCR accuracy on arbitrary real-world scans (depends on Tesseract and scan quality).
- Browser visual rendering (manual checklist covers UI flows).
