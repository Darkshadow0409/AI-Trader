#!/bin/sh
set -eu

: "${AI_TRADER_SERVER_NAME:=_}"

if [ -z "${AI_TRADER_TLS_CERT_PATH:-}" ]; then
  AI_TRADER_TLS_CERT_PATH="/etc/nginx/certs/live/${AI_TRADER_SERVER_NAME}/fullchain.pem"
fi

if [ -z "${AI_TRADER_TLS_KEY_PATH:-}" ]; then
  AI_TRADER_TLS_KEY_PATH="/etc/nginx/certs/live/${AI_TRADER_SERVER_NAME}/privkey.pem"
fi

export AI_TRADER_SERVER_NAME
export AI_TRADER_TLS_CERT_PATH
export AI_TRADER_TLS_KEY_PATH

TEMPLATE_PATH="/etc/ai-trader/templates/http.conf.template"

if [ -f "$AI_TRADER_TLS_CERT_PATH" ] && [ -f "$AI_TRADER_TLS_KEY_PATH" ]; then
  TEMPLATE_PATH="/etc/ai-trader/templates/https.conf.template"
  echo "AI Trader reverse proxy: HTTPS mode enabled for ${AI_TRADER_SERVER_NAME}"
else
  echo "AI Trader reverse proxy: TLS certs not found, starting in HTTP mode for ${AI_TRADER_SERVER_NAME}"
fi

envsubst '${AI_TRADER_SERVER_NAME} ${AI_TRADER_TLS_CERT_PATH} ${AI_TRADER_TLS_KEY_PATH}' \
  < "$TEMPLATE_PATH" \
  > /etc/nginx/conf.d/default.conf

nginx -t
exec nginx -g 'daemon off;'
