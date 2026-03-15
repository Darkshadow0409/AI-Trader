# Verification Tiers

## Fast Developer Verification

Command:

```powershell
python scripts/verify_fast.py
```

Scope:

- backend unit tests only
- frontend fast subset only

Use this for local iteration and small patches.

## Full Local Verification

Command:

```powershell
python scripts/verify.py
```

Scope:

- seed data
- backfill
- full backend pytest suite
- full frontend test suite
- frontend production build

Use this before merging local milestone work.

## Release-Grade Review Bundle

Command:

```powershell
python scripts/build_review_bundle.py
```

Scope:

- reruns full verification in fixture mode
- captures real contract snapshots
- writes diagnostics and review docs
- regenerates `review_bundle/` and `review_bundle.zip`
