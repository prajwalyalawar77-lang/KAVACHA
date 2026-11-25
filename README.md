# KAVACHA

**One Document. Multiple Checks. Complete Trust.**

KAVACHA is an AI-powered Document Trust & Fraud Intelligence platform built for the SYNAPSE 2.0 demonstration. Upload a document once and the platform applies six layers of analysis — document forensics, verification checks, fraud correlation, industrial intelligence, public-safety screening and explainable risk scoring — and shows the evidence behind every score.

> KAVACHA produces **investigative indicators, not accusations**. Risk scores use configurable demonstration thresholds, not calibrated fraud probabilities. External GST, bank or government verification is **only** performed when authorised integrations are configured; otherwise results are clearly labelled as format validation / unverified.

---

## Contents

- [Feature overview](#feature-overview)
- [Screens](#screens)
- [Architecture](#architecture)
- [Technology](#technology)
- [Quick start](#quick-start)
- [Deployment](#deployment)
- [Demo accounts](#demo-accounts)
- [Configuration](#configuration)
- [How analysis works](#how-analysis-works)
- [Security and privacy model](#security-and-privacy-model)
- [Honesty guardrails](#honesty-guardrails)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Documentation](#documentation)
- [Known limitations / roadmap](#known-limitations--roadmap)

---

## Feature overview

| # | Module | What it does |
|---|--------|--------------|
| 1 | **AI Document Forensics** | Error-level analysis (ELA), copy-move detection, noise inconsistency, JPEG blockiness, PDF font and OCR typography checks. Produces suspicious regions, a heatmap and a side-by-side viewer (original left, analysed right, findings underneath). |
| 2 | **Smart Document Verification** | GSTIN (checksum), PAN, IFSC, bank-account, invoice-number and invoice-arithmetic checks; cross-document field comparison; multi-document consistency. |
| 3 | **AI Fraud Intelligence** | SHA-256 + perceptual DNA matching (exact/near duplicates), repeated invoice identifiers, anomaly correlation, supplier risk profiles, relationship graph and alert triage. |
| 4 | **Industrial Document Intelligence** | Organisation workspace: supplier onboarding, invoice ↔ PO consistency checks, expiry alerts and scans. |
| 5 | **Public Document Safety Portal** | Offer-letter / certificate screening, pattern-based PII detection, page-1 redaction, suspicious-document reporting and safety guidance. |
| 6 | **Explainable AI Risk Assessment** | Transparent weighted signals across checks, forensic indicators, metadata and fraud alerts; configurable bands (0–30 Low, 31–60 Medium, 61–80 High, 81–100 Critical); evidence list and recommendations; pluggable ML scorer blended 50/50 when registered. |

Supporting features: JWT auth with roles (admin / industrial / public), route guards enforced server-side, audit trail, notifications, shareable verification reports (token link + QR + PDF) with revoke, secure deletion, per-user retention preference, admin console (users, organisations, audit) and profile/settings.

## Screens

19 pages are implemented in React Router:

1. Landing
2. Login
3. Registration
4. Role selection
5. Main dashboard (role-aware)
6. Document upload
7. AI analysis (document detail)
8. Forensic viewer
9. Smart verification
10. Document comparison
11. Fraud intelligence dashboard
12. Industrial portal
13. Public safety portal
14. Supplier management
15. Supplier detail
16. Risk assessment
17. Verification reports (+ public `/verify/:token` page)
18. Document history
19. Admin dashboard + Profile & settings

---

## Architecture

```
┌──────────────────────────────┐       /api (JWT bearer)        ┌──────────────────────────────┐
│  React 18 + Vite + Tailwind  │ ─────────────────────────────▶ │  Flask API (app factory)     │
│  Router · Chart.js · Axios   │ ◀───────────────────────────── │  SQLAlchemy · JWT · audit    │
└──────────────┬───────────────┘        JSON envelope           └───────┬──────────────┬───────┘
               │                                                       │              │
       blob URLs for previews,                              SQLite / PostgreSQL   storage/
       QR and PDFs (auth required)                                              uploads · artifacts
                                                                                reports · redacted
                                                                                       │
                                          OpenCV · PyMuPDF · Pillow · Tesseract · ReportLab
```

- **API envelope:** every JSON response is `{ "success": true, "data": …, "meta": … }` or `{ "success": false, "error": { "code", "message", "details?" } }`.
- **No public document URLs.** Previews, heatmaps, overlays, QR images and report PDFs are streamed only through authenticated endpoints (except the deliberately limited public report-token page).
- **Storage-relative paths** are stored in the database; files are resolved through a guarded `resolve_storage_path()` helper.

## Technology

- **Frontend:** React 18, Vite 6, React Router 6, Tailwind CSS, Chart.js / react-chartjs-2, Axios.
- **Backend:** Flask 3, Flask-SQLAlchemy 3 (SQLAlchemy 2.0), Flask-Cors, PyJWT, Werkzeug.
- **Document processing:** PyMuPDF, Pillow, OpenCV (headless), NumPy, pytesseract (Tesseract), ReportLab, qrcode.
- **Tests:** pytest.
- **Database:** SQLite by default; PostgreSQL supported via `DATABASE_URL` (install `psycopg[binary]`).

---

## Quick start

Prerequisites: **Python 3.11+**, **Node.js 18+**, and optionally **Tesseract OCR** (with the `kan` language pack for Kannada scans). Native PDF text layers work without Tesseract.

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate      macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

# Create an env file (optional for local demo; required for real deployments)
copy ..\.env.example ..\.env        # Windows
# cp ../.env.example ../.env       # macOS/Linux

flask init-db                        # create tables
flask seed-demo --with-documents     # demo users, org, suppliers + synthetic PDFs
flask run                            # http://127.0.0.1:5000
```

The app factory also calls `db.create_all()` on start, so a fresh SQLite database is created automatically.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev                          # http://localhost:5173 (proxies /api to 127.0.0.1:5000)
```

Open either `http://localhost:5173` or `http://kavacha.localhost:5173`. The second address is used for branded report links: modern browsers resolve any `*.localhost` name to this machine, so no hosts-file edit is needed. On Render the live `onrender.com` domain is detected automatically; set `QR_BASE_URL` only when using a custom domain.

Production build: `npm run build` (output in `frontend/dist`).

### 3. Health check

```bash
curl http://127.0.0.1:5000/api/health
curl http://127.0.0.1:5000/api/meta
```

`/api/meta` reports installed OCR languages, configured external integrations, risk thresholds and limits.

---

## Deployment

KAVACHA ships with a single-service Docker setup: Flask serves the API and the built React frontend from one container, pre-seeded with the demo data. `render.yaml` deploys it to Render's free plan, including generated secrets and a health check.

See [documentation/DEPLOYMENT.md](documentation/DEPLOYMENT.md) for the full walkthrough (GitHub, Render Blueprint, verification, custom domains and free-plan caveats).

> The free Render plan sleeps after inactivity and has no persistent disk, so data resets on redeploy. It is suitable for a judged demo, not for real documents.

---

## Demo accounts

Seeded by `flask seed-demo` (all share the same password):

| Role | Email | Password |
|------|-------|----------|
| Administrator | `admin@kavacha.demo` | `Kavacha@2026` |
| Industrial / Enterprise | `ops@sunrise.example` | `Kavacha@2026` |
| Public / Individual | `priya@public.example` | `Kavacha@2026` |

> Change every password and secret before any real deployment.

---

## Configuration

All configuration is read from environment variables (see `.env.example`). Key variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `SECRET_KEY` / `JWT_SECRET` | dev placeholders | Signing keys — required in production |
| `JWT_EXPIRES_MINUTES` | 720 | Token lifetime |
| `DATABASE_URL` | SQLite in `backend/instance/` | Database connection |
| `STORAGE_ROOT` | `storage/` | Private file root |
| `MAX_UPLOAD_MB` | 25 | Upload size limit |
| `CORS_ORIGINS` | localhost dev origins | Allowed API origins |
| `RISK_MEDIUM_THRESHOLD` / `RISK_HIGH_THRESHOLD` / `RISK_CRITICAL_THRESHOLD` | 30 / 60 / 80 | Demonstration risk bands |
| `AUTH_RATE_LIMIT` / `API_RATE_LIMIT` | 12/min, 600/min | Simple in-memory rate limits |
| `OCR_LANGUAGES` | `eng,kan` | Requested Tesseract languages |
| `ANALYSIS_MAX_PAGES` | 3 | Pages analysed |
| `QR_BASE_URL` | `http://kavacha.localhost:5173/verify` | Base URL embedded in report QR links; auto-detects Render/Spaces hosts, set it for a custom domain |
| `REPORT_EXPIRY_DAYS` | 90 | Share-link lifetime |
| `EXTERNAL_GST_API_URL` / `_KEY`, `EXTERNAL_BANK_API_URL` / `_KEY` | empty | Optional authorised integrations; when empty, external verification is explicitly reported as not performed |
| `DEFAULT_RETENTION_DAYS` | 30 | Initial retention preference |
| `VITE_API_BASE_URL`, `VITE_API_PROXY` | `/api`, `http://127.0.0.1:5000` | Frontend API wiring |

---

## How analysis works

Uploading runs six deterministic stages (recorded per document, with skips/failures surfaced rather than invented):

1. **Secure storage + SHA-256 fingerprint** — file type verified by magic bytes and parser probe; files are stored privately and never executed.
2. **Metadata extraction + OCR** — PyMuPDF text layer first, Tesseract fallback for images/scans; word boxes and confidences retained.
3. **Forensic indicators** — ELA, copy-move, noise, blockiness, font/typography checks produce regions with severity and reasons.
4. **Verification checks** — offline format checks (GSTIN checksum, PAN, IFSC, account format, invoice number/date/arithmetic, expiry, supplier consistency). Comparisons are heuristic.
5. **Fraud correlation** — document-DNA similarity, repeated invoice numbers/identifiers, alerts and supplier profiles.
6. **Explainable risk scoring** — weighted signals → score + confidence + evidence + recommendations. `set_ml_scorer()` can register a trained model; it is blended 50/50 with the transparent rule baseline and labelled accordingly. Without a model the rule baseline is used and reported as such.

**Risk bands (configurable, demonstration only):** 0–30 Low · 31–60 Medium · 61–80 High · 81–100 Critical.

## Security and privacy model

- **Backend-enforced permissions.** Every document/route checks ownership or role: public users see only their own documents; industrial users see their organisation's workspace; admin endpoints require the admin role.
- **Private by default.** There are no public document URLs. Binary resources (preview, heatmap, overlay, QR, PDF, redacted text) are streamed through authenticated endpoints with `Cache-Control: no-store`.
- **Never execute uploads.** Only PDF/JPG/JPEG/PNG are accepted (extension + magic bytes + parser probe); content is parsed, never run.
- **Least data exposure.** Public report pages show checks and risk bands only — never the file, OCR text or personal data. PII endpoints return masked values. Redaction covers detected regions on page 1 and produces a downloadable redacted text copy.
- **Secure deletion.** Deleting a document removes stored files, previews, OCR text, regions, checks, alerts and reports (soft-delete marker retained for audit integrity).
- **Audit trail.** Logins, uploads, analyses, report creation/revocation, redactions, supplier actions and admin changes are recorded with actor, IP and metadata.
- **Hardening basics.** PBKDF2 password hashing, JWT expiry, auth/API rate limits, JSON error envelopes, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, restrictive `Permissions-Policy`.

## Honesty guardrails

These are product rules encoded throughout the UI and API:

- Metadata anomalies or noise inconsistency are **indicators**, not proof of forgery.
- A supplier is **never** labelled fraudulent from an anomaly alone; trust scores summarize evidence and prompt review.
- Duplicate detection, field matching and PO checks compare extracted values — they do not confirm that a document or PO exists in any external system.
- GSTIN/PAN/IFSC checks are **format/checksum validation only** unless authorised APIs are configured.
- QR codes identify a KAVACHA report link; they are **not proof of authenticity**.
- Report links expire, can be revoked, and explicitly state what they do not show.

---

## Testing

### Automated (pytest)

```bash
cd backend
python -m pytest tests -q
```

The suite uses an in-memory SQLite database and a temporary storage root. It covers:

- health/metadata, registration, login error codes, profile/password changes
- role enforcement (public blocked from industrial/admin APIs) and anonymous rejection
- upload → analysis → detail/preview with cross-user isolation
- offline validators, document comparison
- report creation, public token access, QR/PDF download and revocation
- industrial supplier onboarding, invoice ↔ PO checks, supplier verification, expiry
- public-safety PII detection, redaction, redacted text and suspicious-document reporting

### Manual walkthrough (browser)

1. Sign in as each demo account and verify role-specific navigation and dashboards.
2. Upload the seeded PDFs (or your own invoice/offer letter) with auto-analysis.
3. Open the forensic viewer: left original, right analysed overlay, findings and risk below.
4. Review verification checks and risk signals for evidence and confidence.
5. Compare the original and tampered demo invoices.
6. Industrial portal: run the PO check between the demo invoice and PO; scan expiry.
7. Supplier detail: verify against the GST certificate; refresh profile.
8. Public safety: scan the offer letter, redact Aadhaar/PAN, download the redacted text, report a document.
9. Reports: generate a report, open the public share link (also logged out), download PDF, revoke and confirm the link is invalid.
10. Admin: filter users, change a role/deactivate, inspect organisations and the audit trail.
11. Settings: update profile, retention preference, organisation profile; confirm server-side permission messages.

See [documentation/TESTING.md](documentation/TESTING.md) for details and troubleshooting.

## Project structure

```
KAVACHA/
├── backend/
│   ├── app/
│   │   ├── modules/            # forensics, verification, fraud, industrial, public safety, risk
│   │   ├── routes/             # REST blueprints (auth, documents, reports, admin, …)
│   │   ├── services/           # storage, OCR, metadata, reports, audit
│   │   ├── models/             # SQLAlchemy models
│   │   ├── utils/              # responses, security, files, validation, limiter
│   │   ├── config/             # environment-driven config + TestConfig
│   │   ├── seed.py             # demo accounts/organisation/suppliers
│   │   └── demo_documents.py   # synthetic PDF generator for the demo
│   ├── tests/                  # pytest suite
│   ├── instance/               # SQLite database (git-ignored)
│   ├── requirements.txt
│   └── run.py
├── frontend/
│   ├── src/
│   │   ├── components/         # UI kit, charts, tables, guards, icons
│   │   ├── context/            # auth + toasts
│   │   ├── hooks/              # data fetching, polling, debounce
│   │   ├── layouts/            # public + app shells
│   │   ├── pages/              # 19 pages, module pages under pages/modules/
│   │   └── services/api.js     # axios client + envelope unwrapping
│   └── package.json
├── documentation/              # API, database and testing guides
├── storage/                    # private uploads/artifacts/reports/redacted (git-ignored)
├── Dockerfile                  # single-service image: frontend build + API + seeded demo
├── render.yaml                 # Render Blueprint (Docker, free plan, health check)
├── .dockerignore
├── .env.example
└── README.md
```

## Documentation

- [API reference](documentation/API.md)
- [Database and storage](documentation/DATABASE.md)
- [Testing guide](documentation/TESTING.md)
- [Deployment guide](documentation/DEPLOYMENT.md)

## Known limitations / roadmap

- **External verification is not performed** unless `EXTERNAL_*` integrations are configured; even then, results should be treated as one input among several.
- The risk engine ships with a transparent rule baseline. A trained model can be registered via `set_ml_scorer()`; no model is bundled, and scores are not calibrated probabilities.
- OCR quality depends on Tesseract language packs and scan quality. Kannada requires the `kan` pack; missing packs are reported, not silently ignored.
- Multi-page analysis is capped by `ANALYSIS_MAX_PAGES` (default 3); forensic heatmaps cover page 1.
- Retention preference is stored per user, but automatic scheduled purges are not included — deletion is manual (per document) or can be scheduled externally.
- Rate limiting is in-memory and intended for a single-instance demonstration; use a shared store (e.g. Redis) for multi-instance deployments.
- The report public page intentionally exposes only summary checks and risk data; no download of the original is possible from that link.

---

**Disclaimer:** KAVACHA findings are automated indicators, not proof of forgery. Risk bands are configurable demonstration thresholds. Always obtain independent confirmation before acting on a document.
