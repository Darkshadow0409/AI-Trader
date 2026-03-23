FROM node:20-alpine AS build

WORKDIR /app/apps/frontend

COPY apps/frontend/package.json apps/frontend/package-lock.json ./
RUN npm ci

COPY apps/frontend ./
RUN npm run build

FROM nginx:1.27-alpine

COPY apps/frontend/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY apps/frontend/docker-entrypoint.sh /docker-entrypoint.d/40-runtime-config.sh
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html

RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh

ENV AI_TRADER_RUNTIME_API_BASE=/api \
    AI_TRADER_RUNTIME_BACKEND_URL= \
    AI_TRADER_RUNTIME_FRONTEND_URL=

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -q -O - http://127.0.0.1/healthz >/dev/null 2>&1 || exit 1
