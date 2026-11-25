# KAVACHA API reference

Base URL: `http://127.0.0.1:5000` (Vite proxies `/api` to this in development).

All API responses use one envelope:

```json
{ "success": true, "data": { }, "meta": { } }
```

```json
{ "success": false, "error": { "code": "validation_error", "message": "…", "details": { } } }
```

- Authentication: `Authorization: Bearer <JWT>` (except `/api/auth/register`, `/api/auth/login`, `/api/health`, `/api/meta`, `/api/reports/public/<token>`).
- JSON bodies: `Content-Type: application/json`. Uploads use `multipart/form-data`.
- Rate limits (per client): auth endpoints 12/min (register 10/5min, password 6/5min), general API 600/min, public report page 90/min.
- Binary endpoints require the bearer token and return `Cache-Control: no-store`.
- `meta` on list endpoints contains pagination: `page`, `per_page`, `total`, `pages`.

Common error codes: `validation_error` (422), `unauthorized` (401), `invalid_credentials` (401), `token_expired` (401), `account_inactive` (403), `forbidden` (403), `not_found` (404), `conflict`/`email_taken` (409), `file_too_large` (413), `unsupported_media_type` (415), `rate_limited` (429), `not_analysed` (422), `internal_error` (500).

---

## Meta

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | – | Service banner with links |
| GET | `/api/health` | – | DB, storage, OCR, disk status (`503` when degraded) |
| GET | `/api/meta` | – | Modules, roles, document kinds, OCR languages, risk thresholds, external-integration status, limits, security summary |

## Authentication

| Method | Path | Auth | Body / notes |
|---|---|---|---|
| POST | `/api/auth/register` | – | `full_name`, `email`, `password` (≥8, letter+number), `role` (`public`\|`industrial`), `organisation{name,org_type,gstin,pan,address,phone,email,website}` required for industrial |
| POST | `/api/auth/login` | – | `email`, `password` → `token`, `expires_in_minutes`, `user` |
| POST | `/api/auth/logout` | user | Client discards the token |
| GET | `/api/auth/me` | user | `user`, `capabilities{role,can_use_industrial,can_use_public,is_admin}` |
| PATCH | `/api/auth/me` | user | `full_name`, `phone`, `retention_days` |
| POST | `/api/auth/password` | user | `current_password`, `new_password` |
| POST | `/api/auth/role` | user | `role` (`public`\|`industrial`), optional `organisation{…}` |

## Dashboard & notifications

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/dashboard` | user | Role-aware KPIs, monthly trend, risk distribution, recent documents and alerts |
| GET | `/api/notifications?per_page=15` | user | Latest notifications with unread count |
| POST | `/api/notifications/<id>/read` | user | Mark one read |
| POST | `/api/notifications/read-all` | user | Mark all read |

## Documents

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/documents` | user | Upload (`file`, `portal`, `doc_kind`, `language`, `expiry_date`, `auto_analyse`). Runs the six-stage pipeline synchronously; returns `document`, `analysis`, `analysis_error`, `progress` |
| GET | `/api/documents` | user | List own/org documents; filters `portal`, `kind`, `status`, `risk`, `q`, `supplier_id`, `date_from`, `date_to`, `sort`, `direction`; pagination |
| GET | `/api/documents/<id>` | user | Full detail: metadata, OCR, tampering regions, checks, risk, fingerprint, invoice, alerts, reports, artefacts flags |
| GET | `/api/documents/<id>/status` | user | Lightweight polling status |
| POST | `/api/documents/<id>/analyse` | user | Re-run analysis (`language` optional) |
| PATCH | `/api/documents/<id>` | owner/admin | Update editable metadata (`doc_kind`, `expiry_date`, etc.) |
| DELETE | `/api/documents/<id>` | owner/admin | Secure delete (files + derived rows) |
| GET | `/api/documents/<id>/preview?variant=preview\|heatmap\|overlay\|redacted` | user | Page-1 image stream |
| GET | `/api/documents/<id>/artifacts/<name>` | user | Stored artefact (e.g. `ela_heatmap.png`, `diff_vs_2.png`) |
| GET | `/api/documents/reference-data` | user | Portal/kind metadata for forms |
| GET | `/api/documents/duplicate-check` | user | SHA-256/duplicate lookup helpers |

## Verification

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/verification/<id>` | user | Checks + extracted fields + supplier + OCR summary |
| POST | `/api/verification/validate` | user | Offline validator: `gstin`, `pan`, `ifsc`, `bank_account`, `invoice_number` |
| POST | `/api/verification/compare` | user | `left_id`, `right_id` → text similarity, field comparison, metadata diff, visual diff summary |
| POST | `/api/verification/multi` | user | `document_ids[]` (max 6) → pairwise consistency matrix + inconsistencies |
| GET | `/api/verification/comparisons` | industrial/admin | Recent comparison history |

## Risk

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/risk/thresholds` | user | Configured bands |
| PUT | `/api/risk/thresholds` | admin | `medium`, `high`, `critical` |
| GET | `/api/risk/<document_id>` | user | Signals, score, confidence, recommendations for a document |

## Reports (verification summaries)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/reports` | user | `document_id`, optional `base_url` → `report`, `share_url`, `download_url`, `qr_url` |
| GET | `/api/reports` | user | List reports (scoped by role) |
| GET | `/api/reports/<id>` | user | Report detail |
| GET | `/api/reports/<id>/download` | user | PDF stream |
| GET | `/api/reports/<id>/qr` | user | QR PNG stream |
| POST | `/api/reports/<id>/revoke` | owner/admin | Invalidate the public link |
| GET | `/api/reports/public/<token>` | – | Public summary: `valid`, `reason`, document kind/portal/analysed_at/DNA prefix, `risk{score,category,confidence,counts,summary}`, `checks[]`, disclaimer/notice. **Never** includes file, OCR text or personal data |

## Fraud intelligence

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/fraud/overview` | user | Scope KPIs, duplicate flags, alert mix, activity trend |
| GET | `/api/fraud/graph` | user | Document/supplier/identifier relationship graph |
| GET | `/api/fraud/alerts` | user | Alert queue (`status`, `severity`, pagination) |
| PATCH | `/api/fraud/alerts/<id>` | user | Triage (`status`: acknowledged/dismissed/open, optional note) |
| POST | `/api/fraud/rescan` | user | Re-run invoice-number duplicate detection in scope |

## Industrial intelligence

All endpoints require an industrial account with an organisation (or an admin supplying `organisation_id`).

| Method | Path | Description |
|---|---|---|
| GET | `/api/industrial/dashboard` | Counts, trend, supplier status, document mix, top suppliers/documents, recent alerts, definitions |
| GET | `/api/industrial/suppliers` | List (`q`, `status`, pagination) |
| POST | `/api/industrial/suppliers` | Create supplier (name required; GSTIN/PAN validated for format; returns `warnings`) |
| GET | `/api/industrial/suppliers/<id>` | Supplier detail + heuristic profile + linked documents |
| PATCH | `/api/industrial/suppliers/<id>` | Update supplier fields |
| POST | `/api/industrial/suppliers/<id>/verify` | Verify supplier against an analysed document (`document_id`) → match ratio, checks, status, trust |
| POST | `/api/industrial/suppliers/<id>/refresh-profile` | Recompute trust/risk profile |
| POST | `/api/industrial/po-check` | `invoice_id`, `po_id` → PO number, amount, supplier and date-order checks |
| GET | `/api/industrial/expiry-alerts?days=60` | Expired and expiring documents |
| POST | `/api/industrial/expiry-scan` | `horizon_days` → notifications for upcoming expiries |

## Public safety portal

| Method | Path | Description |
|---|---|---|
| GET | `/api/public/overview` | Counts, recent documents, risk distribution, retention, safety tips, privacy commitments |
| GET | `/api/public/documents/<id>/pii` | Pattern-based PII detections (masked values, boxes, confidence) |
| POST | `/api/public/documents/<id>/redact` | `types[]` → redacted page-1 image + redacted text + download URL |
| GET | `/api/public/documents/<id>/redacted-text` | Redacted text file download |
| POST | `/api/public/reports` | `document_id`, `reason`, `description` → suspicious-document report |
| GET | `/api/public/reports` | Submitted reports (own; admin all) |

## Organisations

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/organisations/current` | user | Organisation, org types, active member count |
| PUT | `/api/organisations/current` | industrial | Upsert organisation; returns format-validation `warnings` and an explicit no-lookup note |

## Administration

All admin endpoints require role `admin`.

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/overview` | Users/organisations/documents/open alerts, monthly documents, risk distribution, recent documents and audit |
| GET | `/api/admin/users` | `q`, `role`, `active`, pagination |
| PATCH | `/api/admin/users/<id>` | Change `role`, `is_active`, `retention_days` (guards: self-action, last-admin) |
| GET | `/api/admin/organisations` | Organisation cards with member/document counts |
| GET | `/api/admin/audit-logs` | `action`, `entity_type`, pagination |

---

## Examples

### Register and capture a token

```bash
curl -s -X POST http://127.0.0.1:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"full_name":"Demo User","email":"demo@example.com","password":"Passw0rd123","role":"public"}'
```

### Upload with automatic analysis

```bash
curl -s -X POST http://127.0.0.1:5000/api/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F portal=public -F doc_kind=offer_letter -F auto_analyse=true \
  -F language=eng -F file=@offer-letter.pdf
```

### Create a shareable report and read the public page

```bash
curl -s -X POST http://127.0.0.1:5000/api/reports \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"document_id":1}'

curl -s http://127.0.0.1:5000/api/reports/public/<token>
```

### Validate identifiers (offline format/checksum only)

```bash
curl -s -X POST http://127.0.0.1:5000/api/verification/validate \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"gstin":"29ABCDE1234F1ZW","pan":"ABCDE1234F","ifsc":"HDFC0001234"}'
```

## Permission matrix (summary)

| Area | public | industrial | admin |
|---|---|---|---|
| Own documents, analysis, reports | ✔ | ✔ | ✔ (all) |
| Organisation documents / suppliers / PO checks | – | ✔ | ✔ (choose org) |
| Public-safety PII/redaction/reporting | ✔ (own) | ✔ (own) | ✔ |
| Fraud scope & alerts | own | org | all |
| Risk thresholds write, admin console | – | – | ✔ |
