#!/usr/bin/env sh
set -eu

mkdir -p /app/data/sqlite /app/data/parquet /app/data/diagnostics /app/data/exports /app/data/local_runtime

exec python -m uvicorn app.main:app \
  --app-dir /app/apps/backend \
  --host 0.0.0.0 \
  --port "${AI_TRADER_PORT:-8000}" \
  --proxy-headers \
  --forwarded-allow-ips="*"
