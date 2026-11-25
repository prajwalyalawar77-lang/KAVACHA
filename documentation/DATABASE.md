# Database and storage

## Default setup (zero-install demo)

- Engine: **SQLite** (`sqlite:///…/backend/instance/kavacha.db`).
- Created automatically by `create_app()` (`db.create_all()`).
- WAL mode, foreign keys and `synchronous=NORMAL` are enabled per connection.
- `backend/instance/` is git-ignored.

```bash
cd backend
flask init-db                    # explicit table creation
flask seed-demo                  # demo users, organisation, suppliers
flask seed-demo --with-documents # + synthetic PDFs analysed end-to-end
```

## Using PostgreSQL

1. Install the driver: `pip install "psycopg[binary]>=3.1"` (also uncomment it in `requirements.txt`).
2. Create a database, e.g. `kavacha`.
3. Set `DATABASE_URL=postgresql+psycopg://user:password@host:5432/kavacha` in `.env`.
4. Run `flask init-db` (or `db.create_all()` on startup) then seed.

No code changes are required; the models avoid SQLite-specific types.

## Schema overview

| Table | Purpose | Key columns |
|---|---|---|
| `users` | Accounts | `email` (unique), `password_hash` (PBKDF2), `full_name`, `role` (`admin`/`industrial`/`public`), `organisation_id`, `retention_days`, `is_active`, `last_login_at` |
| `organisations` | Industrial profiles | `name`, `org_type`, `gstin`, `pan`, address/contact fields |
| `documents` | Uploaded files | `uuid`, `owner_id`, `organisation_id`, `original_filename`, `stored_path`, `mime_type`, `file_size`, `sha256`, `portal`, `doc_kind`, `status`, `language`, `page_count`, `expiry_date`, `redacted_path`, `deleted_at` |
| `document_metadata` | Extracted metadata | producer/creator, dates, page count, flags, raw JSON |
| `ocr_results` | OCR output | `text`, `words_json` (boxes/confidences), `confidence`, languages, engine notes |
| `tampering_analysis` | Forensic rollup | indicator JSON, region count/max score, `preview_path`, `heatmap_path`, `overlay_path`, limitations |
| `suspicious_regions` | Heatmap regions | `document_id`, coordinates, `score`, `label`, `reason`, sources |
| `document_fingerprints` | Duplicate DNA | `sha256`, perceptual `dhash`, dimensions/pages |
| `document_versions` | Comparison history | left/right document ids, similarity, change level, field summary |
| `verification_results` | Individual checks | `code`, `name`, `category`, `status`, `severity`, `message`, `details_json` |
| `risk_assessments` | Explainable score | `score`, `category`, `confidence`, signal/evidence JSON, recommendations, engine version, `ml_enabled` |
| `verification_reports` | Shareable reports | `report_token` (unique), `pdf_path`, `qr_path`, `expires_at`, `revoked_at` |
| `suppliers` | Industrial supplier records | `organisation_id`, name, GSTIN/PAN, bank fields, `status`, `trust_score`, `risk_score` |
| `invoices` | Extracted invoice links | `document_id`, `supplier_id`, number, dates, amounts |
| `fraud_alerts` | Fraud queue / reports | type, severity, status, title, description, scope ids |
| `notifications` | User notifications | user, title, body, read flag |
| `audit_logs` | Audit trail | actor, action, entity type/id, IP, metadata JSON, timestamp |

Relationships cascade on document deletion; foreign keys are enforced.

## Storage layout

Root: `STORAGE_ROOT` (default `KAVACHA/storage/`). **Database stores storage-relative paths** (e.g. `uploads/2026/11/<hash>.pdf`, `artifacts/<uuid>/ela_overlay.png`) so the root can move between environments.

```
storage/
├── uploads/YYYY/MM/<hash>.<ext>      # original files (private)
├── artifacts/<document-uuid>/        # preview.png, ela_heatmap.png, ela_overlay.png, diff_vs_N.png
├── reports/<report-id>/              # PDF + QR image
└── redacted/<document-uuid>/         # redacted page-1 image + redacted.txt
```

Path resolution always goes through `app/utils/files.py::resolve_storage_path()`, which rejects traversal outside the storage root.

## Deletion and retention

- **Delete document** (`DELETE /api/documents/<id>`) removes the stored original, artefacts, redacted copies, OCR text, metadata, regions, checks, risk, alerts and reports; the row is soft-deleted (`deleted_at`) so audit records stay meaningful.
- **Retention preference** (`retention_days`, 1–365) is stored per user and shown in the UI. Automatic scheduled purges are **not** bundled — run deletion manually or schedule a job that calls the delete service.
- Deleting a report revokes its public link; revoking does not delete the document.

## Resetting the demo

Stop the backend, then:

```bash
rm -rf backend/instance/kavacha.db* storage/uploads storage/artifacts storage/reports storage/redacted
cd backend
flask init-db
flask seed-demo --with-documents
```

On Windows PowerShell use `Remove-Item -Recurse -Force` on the same paths.

## Schema migrations

The `backend/migrations/` folder is reserved but no migration tool is wired in for the demo. For long-lived deployments add Flask-Migrate/Alembic and baseline the current schema before the first migration.
