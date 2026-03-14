from app.strategy_lab.walk_forward import generate_walk_forward_windows


def test_walk_forward_windows_are_time_ordered() -> None:
    windows = generate_walk_forward_windows(total_bars=200, train_bars=90, test_bars=30, step_bars=30, warmup_bars=20)
    assert len(windows) == 3
    assert windows[0].train_start == 20
    assert windows[0].train_end == 110
    assert windows[0].test_start == 110
    assert windows[0].test_end == 140
    assert windows[1].train_start == 50

