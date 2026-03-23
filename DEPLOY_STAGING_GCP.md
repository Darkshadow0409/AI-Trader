# Deploy AI Trader Staging On One Ubuntu VM

This guide keeps the current local developer workflow intact and adds a separate Docker Compose deployment path for a single Ubuntu VM.

## 1. First server bootstrap

Assumptions:

- Ubuntu 22.04 or 24.04 VM
- one public DNS name such as `staging.example.com`
- ports `80` and optionally `443` open in the VM firewall / cloud firewall
- Docker Engine and Docker Compose plugin installed

Install Docker on a fresh Ubuntu VM:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
newgrp docker
docker --version
docker compose version
```

## 2. Clone the repo

```bash
git clone <your-repo-url> ai-trader
cd ai-trader
```

## 3. Create the staging env file

Copy the shared template:

```bash
cp .env.example .env.production
```

Edit `.env.production` and set at minimum:

- `AI_TRADER_ENV=staging`
- `AI_TRADER_ALLOWED_ORIGINS=["https://staging.example.com"]`
- `AI_TRADER_SERVER_NAME=staging.example.com`
- `AI_TRADER_PUBLIC_BASE_URL=https://staging.example.com`
- `AI_TRADER_RUNTIME_API_BASE=/api`
- `AI_TRADER_RUNTIME_FRONTEND_URL=https://staging.example.com`
- `AI_TRADER_RUNTIME_BACKEND_URL=https://staging.example.com`

Backend/runtime values to review for staging:

- `AI_TRADER_USE_SAMPLE_ONLY`
- `AI_TRADER_ENABLE_SCHEDULER`
- `AI_TRADER_BROKER_MARKET_DATA_ENABLED`
- `AI_TRADER_FRED_API_KEY`
- `AI_TRADER_OPENAI_API_KEY`
- `AI_TRADER_OPENAI_OAUTH_CLIENT_ID`
- `AI_TRADER_OPENAI_OAUTH_CLIENT_SECRET`

Do not commit `.env.production`.

## 4. First deploy

```bash
chmod +x scripts/deploy.sh scripts/check_health.sh scripts/export_release.sh
./scripts/deploy.sh .env.production
```

What this does:

- validates the env file
- runs `git pull --ff-only`
- builds the backend and frontend images
- starts the reverse proxy, frontend, and backend
- runs post-deploy health checks

## 5. Update deploy

On the VM:

```bash
cd ~/ai-trader
./scripts/deploy.sh .env.production
```

That is the standard update path after `git push`.

## 6. Release tar export

If you want a release artifact instead of cloning directly:

```bash
chmod +x scripts/export_release.sh
./scripts/export_release.sh
```

This writes a timestamped `tar.gz` under `release/`.

On a server that was deployed from the release tar instead of `git clone`, `scripts/deploy.sh` will skip `git pull` automatically and just run the Compose deploy.

## 7. Rollback basics

Fast rollback by git commit:

```bash
git log --oneline -n 10
git checkout <known-good-commit>
./scripts/deploy.sh .env.production
```

Return to your main branch later:

```bash
git checkout main
./scripts/deploy.sh .env.production
```

If you use tagged releases, rollback the same way with a tag instead of a raw commit SHA.

## 8. Logs and troubleshooting

Container status:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Tail all logs:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f
```

Tail one service:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f backend
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f frontend
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f reverse-proxy
```

Manual health check:

```bash
./scripts/check_health.sh https://staging.example.com
```

Render the Compose config before deploying:

```bash
AI_TRADER_ENV_FILE=.env.production docker compose --env-file .env.production -f docker-compose.prod.yml config
```

If the frontend loads but API calls fail:

- verify `.env.production` has the right `AI_TRADER_PUBLIC_BASE_URL`
- verify `.env.production` has correct `AI_TRADER_ALLOWED_ORIGINS`
- check `runtime-config.js` inside the frontend container:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec frontend cat /usr/share/nginx/html/runtime-config.js
```

If the backend starts but health checks fail:

- inspect backend logs
- verify `data/` is writable on the server
- verify the VM has enough memory for the backend dependencies

If the reverse proxy starts but routing is wrong:

- inspect the rendered nginx config:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec reverse-proxy cat /etc/nginx/conf.d/default.conf
```

## 9. Notes

- The staging stack stays advisory-only. There is no broker order placement path in this deployment.
- The frontend still uses `runtime-config.js`; the container writes a production-safe version at startup, while local developer tooling keeps its current dynamic behavior.
- The backend persists runtime data under `./data` on the VM, so redeploys do not wipe the local SQLite / DuckDB / parquet state unless you remove that directory yourself.
