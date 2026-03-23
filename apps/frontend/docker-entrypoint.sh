#!/usr/bin/env sh
set -eu

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

runtime_api_base="$(json_escape "${AI_TRADER_RUNTIME_API_BASE:-/api}")"
runtime_backend_url="$(json_escape "${AI_TRADER_RUNTIME_BACKEND_URL:-}")"
runtime_frontend_url="$(json_escape "${AI_TRADER_RUNTIME_FRONTEND_URL:-}")"
generated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

cat > /usr/share/nginx/html/runtime-config.js <<EOF
window.__AI_TRADER_RUNTIME__ = {
  apiBase: "${runtime_api_base}",
  backendUrl: "${runtime_backend_url}",
  frontendUrl: "${runtime_frontend_url}",
  generatedAt: "${generated_at}"
};
EOF
