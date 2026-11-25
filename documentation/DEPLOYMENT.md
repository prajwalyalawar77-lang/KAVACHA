# Deploying KAVACHA

KAVACHA ships as **one Docker web service**: Flask serves both the REST API and the
built React frontend. The image is pre-seeded with the demo accounts, organisation,
suppliers and five synthetic documents, all produced by the real analysis pipeline.

The included `render.yaml` deploys this service on Render's free plan.

| File | Purpose |
|------|---------|
| `Dockerfile` | Builds the React app, installs Python dependencies and Tesseract, seeds the demo data, starts gunicorn. |
| `backend/docker-entrypoint.sh` | Optional startup seed (`SEED_ON_START=1`) and the gunicorn command. |
| `render.yaml` | Render Blueprint: Docker runtime, free plan, health check, generated secrets. |
| `.dockerignore` | Keeps secrets, databases, uploads, virtualenvs and `node_modules` out of the image. |

Locally verified: frontend production build, 10 pytest tests, SPA/API smoke tests in
production mode, and the exact `init-db` + `seed-demo --with-documents` sequence used
by the Docker build. The image itself has not been built on this machine because Docker
is not installed; the first Render build is the real container test.

---

## 1. Put the project on GitHub

The repository root must be the `KAVACHA` folder, not its parent. This lets Render find
`render.yaml` and `Dockerfile` automatically.

In PowerShell:

```powershell
cd "C:\Users\Prajwal\Documents\Qoder\2026-11-25\1494be45\KAVACHA"
git init
git add .
git commit -m "KAVACHA demo"
git branch -M main
```

Create an empty **public** repository named `kavacha` at
<https://github.com/new> (do not add a README, .gitignore or licence), then connect it:

```powershell
git remote add origin https://github.com/YOUR-GITHUB-USERNAME/kavacha.git
git push -u origin main
```

Replace `YOUR-GITHUB-USERNAME` with your GitHub username. If Git asks for a password,
use a GitHub personal access token, not your account password.

The existing `.gitignore` already excludes `.env`, `storage/`, `backend/instance/`,
`node_modules/` and `frontend/dist/`.

<details>
<summary>Shortcut with GitHub CLI</summary>

```powershell
winget install --id GitHub.cli -e
```

Open a new terminal, then:

```powershell
cd "C:\Users\Prajwal\Documents\Qoder\2026-11-25\1494be45\KAVACHA"
gh auth login
gh repo create kavacha --public --source=. --remote=origin --push
```

</details>

---

## 2. Create the Render service

### Recommended: Blueprint

1. Sign in at <https://render.com> with GitHub.
2. Choose **New +** → **Blueprint**.
3. Connect GitHub and select the `kavacha` repository.
4. Render reads `render.yaml`; click **Apply**.

The Blueprint creates a Docker web service named `kavacha` on the free plan with:

- health check `/api/health`
- `FLASK_ENV=production`
- random `SECRET_KEY` and `JWT_SECRET`
- `TRUST_PROXY=1` for Render's TLS proxy
- `ANALYSIS_MAX_PAGES=1` to stay within 512 MB RAM
- automatic deploys on each push to `main`

### Manual alternative

If you prefer **New +** → **Web Service**:

| Setting | Value |
|---------|-------|
| Language / runtime | Docker |
| Branch | `main` |
| Dockerfile path | `./Dockerfile` |
| Health check path | `/api/health` |
| Instance type | Free |

Add these environment variables:

```text
FLASK_ENV=production
TRUST_PROXY=1
ANALYSIS_MAX_PAGES=1
SECRET_KEY=<random value>
JWT_SECRET=<random value>
```

Generate each random value with:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

---

## 3. Verify the live site

The first build takes roughly 5–10 minutes. When Render reports **Live**:

1. Open `https://kavacha.onrender.com` (or the exact URL shown by Render; the name may
   get a suffix if it is already taken).
2. Open `https://kavacha.onrender.com/api/health` — expect HTTP 200 with
   `"status": "ok"`.
3. Sign in with a demo account.
4. Create a verification report and scan its QR code. On Render the report link uses
   the live `onrender.com` domain automatically, because the backend reads
   `RENDER_EXTERNAL_URL` and the frontend sends its current origin.

Demo password for all three accounts: `Kavacha@2026`

| Role | Email |
|------|-------|
| Administrator | `admin@kavacha.demo` |
| Industrial | `ops@sunrise.example` |
| Public | `priya@public.example` |

---

## Free-plan behaviour (important for a demo)

- **Cold starts:** the service sleeps after about 15 minutes without traffic. The next
  request can take 30–60 seconds. Open the site a few minutes before judging so the
  demo starts warm.
- **Ephemeral data:** the free plan has no persistent disk. Every redeploy resets the
  database and uploads to the seeded demo state. This is useful for resetting the demo,
  but do not rely on uploads surviving a deploy.
- **Memory:** 512 MB. `render.yaml` limits analysis to one page per document. Very large
  PDFs may still fail; keep demo files small.
- **Public URL and demo credentials:** anyone with the URL can sign in as admin. Treat
  this deployment as a public demo only. Do not upload real personal, financial or
  identity documents.
- Render may ask you to verify a payment method even when using the free plan.

---

## Custom domain and QR links

To use your own domain, add it in Render under **Settings** → **Custom Domains**, then
set:

```text
QR_BASE_URL=https://your-domain.example/verify
```

Without `QR_BASE_URL`, report QR codes point to the `onrender.com` address. Reports
created before the domain change have the old URL baked into their QR image; create new
reports after changing it.

---

## Updating the deployment

```powershell
cd "C:\Users\Prajwal\Documents\Qoder\2026-11-25\1494be45\KAVACHA"
git add .
git commit -m "Describe the change"
git push
```

Render redeploys automatically. The demo database resets because the free plan has no
persistent disk.

---

## Troubleshooting

| Symptom | Likely cause and fix |
|---------|----------------------|
| Build fails at `npm ci` | `frontend/package-lock.json` is missing or out of sync. Commit it; do not delete it. |
| Build fails installing Tesseract | The base image must stay Debian-based (`python:3.12-slim-bookworm`). |
| Health check returns 503 | Open the Render logs. The response names the failing check: database, storage or OCR. |
| First request shows 502 / takes a minute | Free instance is waking from sleep. Retry. |
| Report QR still points to `localhost` | That report was generated locally before deployment. Create a new report on the live site. |
| Upload or analysis fails | Check the 512 MB limit and the 25 MB upload cap; keep documents to one page. |
| Login fails after a redeploy | The image reseeds on build; use the demo credentials above. |
| Render URL differs from `kavacha.onrender.com` | The name was taken; use the URL shown in the dashboard. |

For paid, non-demo hosting, attach a persistent disk and point both the database and
storage at it, or switch to Render Postgres. The free plan is deliberately ephemeral.
