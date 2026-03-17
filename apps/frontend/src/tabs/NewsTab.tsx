import type { NewsView } from "../types/api";
import { formatDateTimeIST } from "../lib/time";

interface NewsTabProps {
  rows: NewsView[];
  onSelectSymbol: (symbol: string) => void;
}

export function NewsTab({ rows, onSelectSymbol }: NewsTabProps) {
  return (
    <div className="stack">
      {rows.map((item) => (
        <article className="panel compact-panel" key={`${item.source}-${item.published_at}-${item.title}`}>
          <div className="metric-row">
            <strong>{item.title}</strong>
            <span>{formatDateTimeIST(item.published_at)}</span>
          </div>
          <p className="compact-copy">{item.summary}</p>
          <div className="metric-row compact-row">
            <span>{item.source}</span>
            <span>{item.primary_asset ?? item.affected_assets[0] ?? "macro"}</span>
            <span>{item.event_relevance}</span>
            <span>{item.freshness_state}</span>
            <span>{item.market_data_mode}</span>
          </div>
          <div className="inline-tags">
            {item.entity_tags.map((tag) => (
              <span className="tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
          {(item.related_polymarket_markets?.length ?? 0) > 0 ? (
            <div className="stack">
              {item.related_polymarket_markets!.slice(0, 2).map((market) => (
                <div className="metric-row compact-row" key={market.market_id}>
                  <span>{market.question}</span>
                  <span>{market.outcomes[0] ? `${market.outcomes[0].label} ${(market.outcomes[0].probability * 100).toFixed(0)}%` : market.primary_tag}</span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="metric-row">
            <button className="text-button" onClick={() => onSelectSymbol(item.affected_assets[0] ?? "BTC")} type="button">
              Focus {item.affected_assets[0] ?? "macro"}
            </button>
            <a href={item.url} rel="noreferrer" target="_blank">
              Source
            </a>
          </div>
        </article>
      ))}
    </div>
  );
}
