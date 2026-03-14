from __future__ import annotations

from pathlib import Path

import polars as pl


class ManualCSVImporter:
    def read_bars(self, path: Path) -> list[dict[str, object]]:
        frame = pl.read_csv(path, try_parse_dates=True)
        return frame.to_dicts()

