# Self-contained image for hosts that treat backend/ as the build root.
# The React bundle is prebuilt into backend/frontend by the repository so this
# build does not need the frontend sources or Node.js.

FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLASK_ENV=production \
    FLASK_APP=run.py \
    SERVE_FRONTEND=1 \
    TRUST_PROXY=1 \
    ANALYSIS_MAX_PAGES=1 \
    OCR_LANGUAGES=eng,kan \
    MALLOC_ARENA_MAX=2

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      tesseract-ocr tesseract-ocr-eng tesseract-ocr-kan \
      fonts-dejavu-core libglib2.0-0 libgomp1 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY run.py ./
COPY wsgi.py ./

# Prebuilt React app. Flask serves /app/frontend/dist and falls back to
# index.html for client-side routes.
COPY frontend /app/frontend/dist

# Seed demo accounts, organisation, suppliers and synthetic documents so the
# live demo is usable immediately after a cold start.
RUN mkdir -p /app/storage /app/backend/instance \
 && python -m flask init-db \
 && python -m flask seed-demo --with-documents

COPY docker-entrypoint.sh /usr/local/bin/kavacha-entrypoint
RUN chmod +x /usr/local/bin/kavacha-entrypoint

EXPOSE 10000
ENTRYPOINT ["/usr/local/bin/kavacha-entrypoint"]
