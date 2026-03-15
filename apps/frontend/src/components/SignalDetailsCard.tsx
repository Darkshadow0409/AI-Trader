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
  const reality = signalDetail?.data_reality ?? signal?.data_reality ?? context.data_reality;

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
            {reality ? (
              <div>
                <span className="metric-label">Reality</span>
                <strong>
                  {reality.provenance.realism_grade} / {reality.freshness_state}
                </strong>
              </div>
            ) : null}
          </div>
          {reality ? (
            <div className="stack">
              <div className="metric-row compact-row">
                <span>
                  {reality.provenance.source_type} via {reality.provenance.source_name}
                </span>
                <span>score {reality.realism_score.toFixed(1)}</span>
              </div>
              <div className="metric-row compact-row">
                <span>
                  {reality.provenance.research_symbol} {"->"} {reality.provenance.tradable_symbol}
                </span>
                <span>{reality.provenance.intended_venue}</span>
              </div>
              <div className="metric-row compact-row">
                <span>{reality.provenance.source_timing}</span>
                <span>{reality.execution_suitability}</span>
              </div>
              <div className="metric-row compact-row">
                <span>{reality.news_suitability}</span>
                <span>SLA {reality.provenance.freshness_sla_minutes}m</span>
              </div>
              <small>{reality.tradable_alignment_note}</small>
              <small>{reality.timing_semantics_note}</small>
              {reality.event_context_note ? <small>{reality.event_context_note}</small> : null}
              {reality.ui_warning ? <small>{reality.ui_warning}</small> : null}
            </div>
          ) : null}
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
          {reality && reality.penalties.length > 0 ? (
            <div className="inline-tags">
              {reality.penalties.slice(0, 3).map((penalty) => (
                <span className="tag" key={penalty.code}>
                  {penalty.code}
                </span>
              ))}
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
