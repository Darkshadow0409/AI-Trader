from __future__ import annotations

from pydantic import BaseModel


class WalkForwardWindow(BaseModel):
    warmup_start: int
    train_start: int
    train_end: int
    test_start: int
    test_end: int


def generate_walk_forward_windows(
    total_bars: int,
    warmup_bars: int,
    train_bars: int,
    test_bars: int,
    step_bars: int,
) -> list[WalkForwardWindow]:
    windows: list[WalkForwardWindow] = []
    train_start = warmup_bars
    while train_start + train_bars + test_bars <= total_bars:
        train_end = train_start + train_bars
        test_start = train_end
        test_end = test_start + test_bars
        windows.append(
            WalkForwardWindow(
                warmup_start=max(0, train_start - warmup_bars),
                train_start=train_start,
                train_end=train_end,
                test_start=test_start,
                test_end=test_end,
            )
        )
        train_start += step_bars
    return windows
