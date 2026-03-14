import type { HealthView, RibbonView } from "../types/api";

interface TopRibbonProps {
  health: HealthView;
  ribbon: RibbonView;
}

function formatTime(value: string | null): string {
  return value ? new Date(value).toLocaleTimeString() : "n/a";
}

export function TopRibbon({ health, ribbon }: TopRibbonProps) {
  const nextEvent = ribbon.next_event as { title?: string; impact?: string } | null;

  return (
    <header className="top-ribbon" data-testid="top-ribbon">
      <div className="ribbon-block">
        <span className="ribbon-label">Regime</span>
        <strong>{ribbon.macro_regime}</strong>
      </div>
      <div className="ribbon-block">
        <span className="ribbon-label">Freshness</span>
        <strong>
          {ribbon.data_freshness_minutes}m / {ribbon.freshness_status}
        </strong>
      </div>
      <div className="ribbon-block">
        <span className="ribbon-label">Risk Budget</span>
        <strong>
          {ribbon.risk_budget_used_pct.toFixed(2)} / {ribbon.risk_budget_total_pct.toFixed(2)}%
        </strong>
      </div>
      <div className="ribbon-block">
        <span className="ribbon-label">Pipeline</span>
        <strong>
          {ribbon.pipeline_status} / {ribbon.source_mode}
        </strong>
      </div>
      <div className="ribbon-block">
        <span className="ribbon-label">Next Event</span>
        <strong>{nextEvent?.title ?? "none"}</strong>
      </div>
      <div className="ribbon-block">
        <span className="ribbon-label">Mode</span>
        <strong>
          {health.status} / {formatTime(ribbon.last_refresh)}
        </strong>
      </div>
    </header>
  );
}
