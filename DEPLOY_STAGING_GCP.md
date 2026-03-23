# Deploy AI Trader On GCP At `aitrader.sajaljain.me`

This keeps the current three-service deployment shape:

- `reverse-proxy`
- `frontend`
- `backend`

The stack stays advisory-only and keeps the current `runtime-config.js` behavior. On the server, the frontend container writes the live runtime config at boot.

## 1. Namecheap DNS records

In Namecheap, open the DNS panel for `sajaljain.me` and create:

| Type | Host | Value | TTL |
|---|---|---|---|
| `A Record` | `aitrader` | `<GCP_VM_PUBLIC_IP>` | `Automatic` |

Optional IPv6:

| Type | Host | Value | TTL |
|---|---|---|---|
| `AAAA Record` | `aitrader` | `<GCP_VM_IPV6>` | `Automatic` |

After saving, verify:

```bash
dig +short aitrader.sajaljain.me
nslookup aitrader.sajaljain.me
```

## 2. GCP VM assumptions

- Ubuntu `22.04` or `24.04`
- one static external IPv4 attached to the VM
- Docker Engine + Docker Compose plugin installed on the VM
- ports `80` and `443` allowed in both:
  - GCP VPC firewall
  - VM firewall if `ufw` is enabled

Example GCP firewall commands:

```bash
gcloud compute firewall-rules create aitrader-allow-http \
  --allow tcp:80 \
  --target-tags aitrader

gcloud compute firewall-rules create aitrader-allow-https \
  --allow tcp:443 \
  --target-tags aitrader
```

Attach the `aitrader` network tag to the VM.

## 3. Ubuntu bootstrap commands

SSH into the VM and run:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg ufw certbot
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
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
newgrp docker
docker --version
docker compose version
```

## 4. Clone and prepare the repo

```bash
git clone <your-repo-url> ai-trader
cd ai-trader
cp .env.example .env.production
chmod +x scripts/deploy.sh scripts/check_health.sh scripts/export_release.sh
mkdir -p deploy/acme deploy/certs
```

## 5. Required `.env.production` values

Set these exactly for the subdomain deployment:

```dotenv
AI_TRADER_ENV=staging
AI_TRADER_ALLOWED_ORIGINS=["https://aitrader.sajaljain.me"]
AI_TRADER_SERVER_NAME=aitrader.sajaljain.me
AI_TRADER_PUBLIC_BASE_URL=https://aitrader.sajaljain.me
AI_TRADER_PUBLIC_HTTP_PORT=80
AI_TRADER_PUBLIC_HTTPS_PORT=443
AI_TRADER_RUNTIME_API_BASE=/api
AI_TRADER_RUNTIME_FRONTEND_URL=https://aitrader.sajaljain.me
AI_TRADER_RUNTIME_BACKEND_URL=https://aitrader.sajaljain.me
AI_TRADER_HEALTHCHECK_BASE_URL=http://aitrader.sajaljain.me
AI_TRADER_TLS_MOUNT_DIR=/etc/letsencrypt
AI_TRADER_TLS_CERT_PATH=/etc/nginx/certs/live/aitrader.sajaljain.me/fullchain.pem
AI_TRADER_TLS_KEY_PATH=/etc/nginx/certs/live/aitrader.sajaljain.me/privkey.pem
```

Review these before the first deploy:

- `AI_TRADER_USE_SAMPLE_ONLY`
- `AI_TRADER_ENABLE_SCHEDULER`
- `AI_TRADER_BROKER_MARKET_DATA_ENABLED`
- `AI_TRADER_FRED_API_KEY`
- `AI_TRADER_OPENAI_API_KEY`
- `AI_TRADER_OPENAI_OAUTH_CLIENT_ID`
- `AI_TRADER_OPENAI_OAUTH_CLIENT_SECRET`

Do not commit `.env.production`.

## 6. First deploy over HTTP

Run the standard deploy once before the certificate exists:

```bash
bash scripts/deploy.sh .env.production
```

At this point the reverse proxy will detect that no TLS cert is mounted and will start in HTTP mode on port `80`.

Verify:

```bash
curl -I http://aitrader.sajaljain.me
bash scripts/check_health.sh http://aitrader.sajaljain.me
```

## 7. Issue the Let’s Encrypt certificate

The reverse proxy serves `/.well-known/acme-challenge/` from `deploy/acme`, so use Certbot webroot mode:

```bash
sudo certbot certonly \
  --webroot \
  -w /home/$USER/ai-trader/deploy/acme \
  -d aitrader.sajaljain.me \
  --email you@sajaljain.me \
  --agree-tos \
  --no-eff-email
```

The repo is already configured to mount `/etc/letsencrypt` into the reverse-proxy container, so no copy step is needed.

## 8. Switch the stack to HTTPS

Redeploy after the cert is issued:

```bash
bash scripts/deploy.sh .env.production
```

The reverse proxy will detect:

- `/etc/nginx/certs/live/aitrader.sajaljain.me/fullchain.pem`
- `/etc/nginx/certs/live/aitrader.sajaljain.me/privkey.pem`

and will automatically switch to:

- HTTP on `80` for ACME and redirect
- HTTPS on `443` for the live app

Verify:

```bash
curl -I http://aitrader.sajaljain.me
curl -I https://aitrader.sajaljain.me
bash scripts/check_health.sh https://aitrader.sajaljain.me
```

After HTTPS is working, change:

```dotenv
AI_TRADER_HEALTHCHECK_BASE_URL=https://aitrader.sajaljain.me
```

or leave it blank to make `deploy.sh` use `AI_TRADER_PUBLIC_BASE_URL`.

## 9. Standard update deploy

After pushing changes:

```bash
cd ~/ai-trader
bash scripts/deploy.sh .env.production
```

That will:

- pull latest git changes when running from a git checkout
- rebuild images
- force-recreate containers so proxy/config changes apply
- run post-deploy health checks

If you deploy from the release tarball instead of `git clone`, `deploy.sh` will skip `git pull` automatically.

## 10. Release tarball

Create a deployable tarball:

```bash
bash scripts/export_release.sh
```

This writes a timestamped file under `release/`.

## 11. Rollback basics

Rollback by git commit:

```bash
cd ~/ai-trader
git log --oneline -n 10
git checkout <known-good-commit>
bash scripts/deploy.sh .env.production
```

Return to the branch later:

```bash
git checkout main
bash scripts/deploy.sh .env.production
```

## 12. Verification commands

Rendered Compose config:

```bash
AI_TRADER_ENV_FILE=.env.production docker compose --env-file .env.production -f docker-compose.prod.yml config
```

Container status:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Tail logs:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f reverse-proxy
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f frontend
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f backend
```

Runtime config inside frontend:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec frontend cat /usr/share/nginx/html/runtime-config.js
```

Rendered nginx config:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec reverse-proxy cat /etc/nginx/conf.d/default.conf
```

## 13. Troubleshooting

### DNS not resolving

- confirm the `A` record exists in Namecheap for host `aitrader`
- confirm the record points to the VM public IP
- wait for propagation, then run:

```bash
dig +short aitrader.sajaljain.me
```

If the result is empty or wrong, fix DNS first. The deploy will not make the name resolve.

### TLS / cert issue

If HTTPS does not come up:

- check whether the cert exists:

```bash
sudo ls -l /etc/letsencrypt/live/aitrader.sajaljain.me/
```

- inspect reverse-proxy logs:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs reverse-proxy
```

- if the cert is missing or expired, re-run:

```bash
sudo certbot certonly --webroot -w /home/$USER/ai-trader/deploy/acme -d aitrader.sajaljain.me
```

Then redeploy:

```bash
bash scripts/deploy.sh .env.production
```

### Backend not reachable through proxy

Check backend health inside the Compose network:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec backend python - <<'PY'
import urllib.request
print(urllib.request.urlopen("http://127.0.0.1:8000/api/health", timeout=5).read().decode())
PY
```

If backend is healthy internally but `/api/*` fails publicly, inspect:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec reverse-proxy cat /etc/nginx/conf.d/default.conf
```

### Websocket or API proxy failures

- confirm `runtime-config.js` contains `apiBase: "/api"`
- confirm `.env.production` uses the same public subdomain for:
  - `AI_TRADER_PUBLIC_BASE_URL`
  - `AI_TRADER_RUNTIME_FRONTEND_URL`
  - `AI_TRADER_RUNTIME_BACKEND_URL`
- tail reverse-proxy logs while reproducing the failure:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f reverse-proxy
```

If the frontend loads but the API or websocket path fails, it is almost always one of:

- wrong public URL env values
- wrong TLS cert mount path
- port `80` or `443` blocked in GCP or `ufw`

## 14. Notes

- This deployment remains advisory-only. There is no broker order placement path.
- The app is intended for one VM staging/production-like deployment, not HA.
- Redeploys do not wipe `./data` unless you delete that directory yourself.
- The reverse proxy is subdomain-based. This is not configured for `/aitrader` path-prefix deployment.
