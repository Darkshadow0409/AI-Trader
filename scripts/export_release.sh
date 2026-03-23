#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${1:-$ROOT_DIR/release}"
STAMP="$(date -u +%Y%m%d_%H%M%S)"
ARCHIVE_NAME="ai_trader_staging_${STAMP}.tar.gz"
ARCHIVE_PATH="$OUTPUT_DIR/$ARCHIVE_NAME"

mkdir -p "$OUTPUT_DIR"

cd "$ROOT_DIR"

tar \
  --exclude=".git" \
  --exclude=".venv" \
  --exclude="node_modules" \
  --exclude="apps/frontend/node_modules" \
  --exclude="apps/frontend/dist" \
  --exclude="apps/backend/.mypy_cache" \
  --exclude="apps/backend/tests/__pycache__" \
  --exclude="data/local_runtime" \
  --exclude="data/sqlite" \
  --exclude="data/parquet" \
  --exclude="data/diagnostics" \
  --exclude="data/exports" \
  --exclude="review_bundle" \
  --exclude="review_bundle.zip" \
  --exclude="release" \
  --exclude="*.log" \
  --exclude="*.zip" \
  --exclude="*.tar.gz" \
  -czf "$ARCHIVE_PATH" \
  .env.example \
  .gitignore \
  .dockerignore \
  docker-compose.prod.yml \
  README.md \
  RUN_LOCAL.md \
  START_HERE.md \
  PILOT_RUNBOOK.md \
  PILOT_CHECKLIST.md \
  DEPLOY_STAGING_GCP.md \
  apps \
  deploy \
  scripts

echo "Release archive created: $ARCHIVE_PATH"
