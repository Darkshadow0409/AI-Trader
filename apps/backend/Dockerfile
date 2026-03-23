FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app/apps/backend

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY apps/backend/requirements.txt /tmp/requirements.txt

RUN pip install --upgrade pip setuptools wheel \
    && pip install --no-cache-dir -r /tmp/requirements.txt

COPY apps/backend /app/apps/backend
COPY scripts /app/scripts
COPY .env.example /app/.env.example

RUN mkdir -p /app/data/sqlite /app/data/parquet /app/data/diagnostics /app/data/exports /app/data/local_runtime

COPY apps/backend/docker-entrypoint.sh /usr/local/bin/docker-backend-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-backend-entrypoint.sh

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=5)"

ENTRYPOINT ["docker-backend-entrypoint.sh"]
