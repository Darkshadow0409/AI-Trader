from fastapi.testclient import TestClient

from app.main import app
from app.services.pipeline import seed_and_refresh


def test_ui_summary_and_ops_routes_are_available() -> None:
    seed_and_refresh()
    client = TestClient(app)

    home = client.get("/api/dashboard/home-summary")
    signals = client.get("/api/signals/summary")
    tickets = client.get("/api/tickets/summary")
    review = client.get("/api/session/review-summary")
    pilot = client.get("/api/session/pilot-summary")
    ops = client.get("/api/system/ops-summary")

    assert home.status_code == 200
    assert signals.status_code == 200
    assert tickets.status_code == 200
    assert review.status_code == 200
    assert pilot.status_code == 200
    assert ops.status_code == 200

    assert "pilot_gate_state" in home.json()
    assert "grouped_counts" in signals.json()
    assert "counts_by_state" in tickets.json()
    assert "adherence_summary" in review.json()
    assert "ticket_funnel" in pilot.json()
    assert "available_actions" in ops.json()


def test_ops_actions_are_audited_and_heavy_actions_require_confirmation() -> None:
    seed_and_refresh()
    client = TestClient(app)

    refresh = client.post("/api/system/actions/system_refresh", json={})
    assert refresh.status_code == 200
    assert refresh.json()["action_name"] == "system_refresh"
    assert refresh.json()["status"] in {"success", "failed"}

    history = client.get("/api/system/action-history")
    assert history.status_code == 200
    assert any(item["action_name"] == "system_refresh" for item in history.json())

    heavy = client.post("/api/system/actions/build_review_bundle", json={})
    assert heavy.status_code == 400
    assert "confirm_heavy" in heavy.json()["detail"]
