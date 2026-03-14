from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "backend"))

from app.services.pipeline import refresh_pipeline


if __name__ == "__main__":
    summary = refresh_pipeline(force_live=False)
    print(summary.model_dump_json(indent=2))
