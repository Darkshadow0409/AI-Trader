# Repo Push Checklist

This repo was cleaned to be push-safe for a private GitHub repository.

## Removed from Git history

These generated paths were removed from all commits:

- `data/`
- `review_bundle/`
- `review_bundle.zip`
- `apps/frontend/tsconfig.app.tsbuildinfo`
- `apps/frontend/tsconfig.node.tsbuildinfo`
- `docs/USER_MANUAL.html`
- `docs/USER_MANUAL.pdf`

## Intentionally ignored going forward

These are now excluded from Git:

- all local env files via `.env.*`
- all runtime data under `data/`
- SQLite, WAL, SHM, DuckDB, Parquet, diagnostics, exports
- `review_bundle/` and `review_bundle.zip`
- release archives like `*.tar.gz` and `*.zip`
- TypeScript build info via `*.tsbuildinfo`
- generated manual outputs:
  - `docs/USER_MANUAL.html`
  - `docs/USER_MANUAL.pdf`
- deployment certs and ACME challenge artifacts:
  - `deploy/certs/`
  - `deploy/acme/`

Tracked exception:

- `.env.example`
- `data/.gitkeep`

## Backup outside Git

Do not rely on Git for these:

- local SQLite / DuckDB state under `data/`
- diagnostics and runtime logs
- pilot/report exports
- generated review bundles
- deployed TLS certs
- local `.env.production` or other secret env files

## First push commands

If the GitHub repository is new and empty:

```bash
git remote add origin git@github.com:<your-user-or-org>/<private-repo>.git
git push -u origin main
git push origin --tags
```

If you already created the remote and want to replace rejected history safely:

```bash
git remote add origin git@github.com:<your-user-or-org>/<private-repo>.git
git push -u origin main --force-with-lease
git push origin --tags --force-with-lease
```

## Final local checks

Run these before the first push:

```bash
git ls-files
git status
git rev-list --objects --all
```

Verify there are no tracked runtime artifacts left under:

- `data/`
- `review_bundle/`
- `docs/USER_MANUAL.html`
- `docs/USER_MANUAL.pdf`
- `apps/frontend/*.tsbuildinfo`
