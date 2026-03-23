#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${AI_TRADER_PUBLIC_BASE_URL:-http://127.0.0.1}}"
BASE_URL="${BASE_URL%/}"

check_contains() {
  local url="$1"
  local needle="$2"
  local body
  body="$(curl -fsS "$url")"
  if [[ "$body" != *"$needle"* ]]; then
    echo "Health check failed for $url: missing '$needle'" >&2
    exit 1
  fi
}

echo "Checking frontend root at $BASE_URL/ ..."
check_contains "$BASE_URL/" "AI Trader"

echo "Checking runtime-config.js ..."
check_contains "$BASE_URL/runtime-config.js" "window.__AI_TRADER_RUNTIME__"
check_contains "$BASE_URL/runtime-config.js" "apiBase"

echo "Checking backend health ..."
check_contains "$BASE_URL/api/health" "\"status\":\"ok\""

echo "Checking dashboard overview ..."
check_contains "$BASE_URL/api/dashboard/overview" "\"market_data_mode\""

echo "Checking dashboard desk ..."
check_contains "$BASE_URL/api/dashboard/desk" "\"execution_gate\""

echo "Health checks passed."
