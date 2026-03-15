import type { AssetContextView, SignalDetailView } from "../types/api";
import { Panel } from "./Panel";
import { StateBlock } from "./StateBlock";

interface SignalDetailsCardProps {
  context: AssetContextView;
  detail: SignalDetailView | null;
  loading?: boolean;
  error?: string | null;
}

export function SignalDetailsCard({ context, detail, loading, error }: SignalDetailsCardProps) {
  const signal = detail ?? context.latest_signal;
  const risk = detail?.related_risk ?? context.latest_risk;
  const signalDetail = detail;

  return (
    <Panel
      title={context.symbol}
      eyebrow="Signal Detail"
      extra={<span className={signal ? `direction ${signal.direction}` : "muted-copy"}>{signal?.direction ?? "no signal"}</span>}
    >
      <StateBlock loading={loading} error={error} />
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
            {signalDetail ? (
              <div>
                <span className="metric-label">Freshness</span>
                <strong>{signalDetail.freshness_status}</strong>
              </div>
            ) : null}
          </div>
          {signalDetail ? (
            <div className="stack">
              {signalDetail.evidence.slice(0, 4).map((item) => (
                <div className="metric-row compact-row" key={item.label}>
                  <span>
                    {item.label}: {item.value}
                  </span>
                  <span>{item.verdict}</span>
                </div>
              ))}
            </div>
          ) : null}
          {risk ? (
            <div className="inline-tags">
              <span className="tag">risk {risk.max_portfolio_risk_pct.toFixed(3)}%</span>
              <span className="tag">{risk.size_band}</span>
              <span className="tag">{risk.exposure_cluster}</span>
            </div>
          ) : null}
          {signalDetail && signalDetail.catalyst_news.length > 0 ? (
            <div className="stack">
              {signalDetail.catalyst_news.slice(0, 2).map((item) => (
                <div className="metric-row compact-row" key={`${item.source}-${item.title}`}>
                  <span>{item.title}</span>
                  <span>{item.freshness_minutes}m</span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="muted-copy">No live or seeded signal is available for this asset.</p>
      )}
    </Panel>
  );
}
