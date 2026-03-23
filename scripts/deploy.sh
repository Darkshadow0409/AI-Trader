#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-${AI_TRADER_ENV_FILE:-$ROOT_DIR/.env.production}}"
COMPOSE_FILE="$ROOT_DIR/docker-compose.prod.yml"

require_value() {
  local key="$1"
  local value
  value="$(grep -E "^${key}=" "$ENV_FILE" | tail -n1 | cut -d'=' -f2- || true)"
  if [[ -z "${value// }" ]]; then
    echo "Missing required env var in $ENV_FILE: $key" >&2
    exit 1
  fi
}

read_value() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" | tail -n1 | cut -d'=' -f2- || true
}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Compose file not found: $COMPOSE_FILE" >&2
  exit 1
fi

require_value "AI_TRADER_SERVER_NAME"
require_value "AI_TRADER_PUBLIC_BASE_URL"
require_value "AI_TRADER_ALLOWED_ORIGINS"

PUBLIC_BASE_URL="$(read_value "AI_TRADER_PUBLIC_BASE_URL")"
HEALTHCHECK_BASE_URL="$(read_value "AI_TRADER_HEALTHCHECK_BASE_URL")"

if [[ -z "${HEALTHCHECK_BASE_URL// }" ]]; then
  HEALTHCHECK_BASE_URL="$PUBLIC_BASE_URL"
fi

cd "$ROOT_DIR"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Pulling latest git changes..."
  git pull --ff-only
else
  echo "No git checkout detected. Skipping git pull."
fi

echo "Deploying AI Trader staging stack with $ENV_FILE ..."
AI_TRADER_ENV_FILE="$ENV_FILE" docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build --force-recreate --remove-orphans

echo "Pruning old dangling images..."
docker image prune -f --filter "until=168h" >/dev/null || true

echo "Running post-deploy health check..."
"$ROOT_DIR/scripts/check_health.sh" "${HEALTHCHECK_BASE_URL:-http://127.0.0.1}"

echo "Deploy complete."
