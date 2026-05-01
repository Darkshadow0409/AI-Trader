import type { AssetReadinessView } from "../lib/assetReadiness";

interface AssetReadinessBannerProps {
  readiness: AssetReadinessView;
  title?: string;
}

export function AssetReadinessBanner({ readiness, title = "Selected Asset Readiness" }: AssetReadinessBannerProps) {
  const toneClass =
    readiness.tone === "positive"
      ? "state-block"
      : readiness.tone === "warning"
        ? "state-block state-warning"
        : "state-block";

  return (
    <article className="panel compact-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">{title}</p>
          <h3>{readiness.badgeLabel}</h3>
        </div>
      </div>
      <div className={toneClass}>
        <strong>{readiness.headline}</strong>
        <div>{readiness.summary}</div>
      </div>
      <small>{readiness.nextStep}</small>
    </article>
  );
}
