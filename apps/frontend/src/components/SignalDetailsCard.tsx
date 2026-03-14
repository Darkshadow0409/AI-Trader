import type { AssetContextView } from "../types/api";
import { Panel } from "./Panel";

interface SignalDetailsCardProps {
  context: AssetContextView;
}

export function SignalDetailsCard({ context }: SignalDetailsCardProps) {
  const signal = context.latest_signal;
  const risk = context.latest_risk;

  return (
    <Panel
      title={context.symbol}
      eyebrow="Signal Detail"
      extra={<span className={signal ? `direction ${signal.direction}` : "muted-copy"}>{signal?.direction ?? "no signal"}</span>}
    >
      {signal ? (
        <>
          <p className="compact-copy">{signal.thesis}</p>
          <div className="metric-strip compact-metrics">
            <div>
              <span className="metric-label">Score</span>
              <strong>{signal.score.toFixed(1)}</strong>
            </div>
            <div>
              <span className="metric-label">Confidence</span>
              <strong>{(signal.confidence * 100).toFixed(0)}%</strong>
            </div>
            <div>
              <span className="metric-label">Noise</span>
              <strong>{(signal.noise_probability * 100).toFixed(0)}%</strong>
            </div>
            <div>
              <span className="metric-label">Invalidation</span>
              <strong>{signal.invalidation.toFixed(2)}</strong>
            </div>
            <div>
              <span className="metric-label">Target / Stretch</span>
              <strong>
                {signal.targets.base?.toFixed(2)} / {signal.targets.stretch?.toFixed(2)}
              </strong>
            </div>
            <div>
              <span className="metric-label">Data</span>
              <strong>{signal.data_quality}</strong>
            </div>
          </div>
          {risk ? (
            <div className="inline-tags">
              <span className="tag">risk {risk.max_portfolio_risk_pct.toFixed(3)}%</span>
              <span className="tag">{risk.size_band}</span>
              <span className="tag">{risk.exposure_cluster}</span>
            </div>
          ) : null}
        </>
      ) : (
        <p className="muted-copy">No live or seeded signal is available for this asset.</p>
      )}
    </Panel>
  );
}
