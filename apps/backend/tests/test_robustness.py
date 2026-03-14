from app.strategy_lab.robustness import parameter_stability_score, score_robustness


def test_parameter_stability_penalizes_wide_dispersion() -> None:
    stable = parameter_stability_score([{"threshold": 1.1}, {"threshold": 1.1}, {"threshold": 1.2}])
    unstable = parameter_stability_score([{"threshold": 1.1}, {"threshold": 2.8}, {"threshold": 4.4}])
    assert stable > unstable


def test_robustness_score_rewards_balanced_results() -> None:
    strong = score_robustness(18.0, -9.0, 1.2, 14, 0.67, 0.82)
    weak = score_robustness(4.0, -18.0, 0.1, 3, 0.2, 0.3)
    assert strong > weak
