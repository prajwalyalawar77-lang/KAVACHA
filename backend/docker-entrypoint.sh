#!/bin/sh
set -e

# Free deployments ship a pre-seeded image. When a persistent disk is attached,
# set SEED_ON_START=1 so an empty database is populated once.
if [ "${SEED_ON_START:-0}" = "1" ]; then
  python -m flask init-db
  python -m flask seed-demo --with-documents
fi

exec gunicorn \
  --chdir /app/backend \
  --worker-class gthread \
  --workers "${WEB_CONCURRENCY:-1}" \
  --threads "${WEB_THREADS:-4}" \
  --timeout "${WEB_TIMEOUT:-300}" \
  --bind "0.0.0.0:${PORT:-10000}" \
  --access-logfile - \
  run:app
