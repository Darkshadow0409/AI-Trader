from __future__ import annotations

from typing import Any

from app.engines.risk.risk_report_builder import build_risk_report


def generate_risk_reports(signals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    reports: list[dict[str, Any]] = []
    for signal in signals:
        reports.append(build_risk_report(signal))
    return reports
