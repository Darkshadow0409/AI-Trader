import { useMemo, useState } from "react";
import { formatDateTimeIST } from "../lib/time";
import { StateBlock } from "../components/StateBlock";
import type { PolymarketHunterView } from "../types/api";

interface PolymarketHunterTabProps {
  error?: string | null;
  hunter: PolymarketHunterView;
  loading?: boolean;
  onSelectSymbol: (symbol: string) => void;
}

function valueForSort(row: PolymarketHunterView["markets"][number], sort: string): number {
  switch (sort) {
    case "liquidity":
      return row.liquidity;
    case "recent":
      return row.recent_activity;
    case "relevance":
      return row.relevance_score;
    default:
      return row.volume;
  }
}

export function PolymarketHunterTab({ error, hunter, loading, onSelectSymbol }: PolymarketHunterTabProps) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState("relevance");
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(hunter.markets[0]?.market_id ?? null);

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...hunter.markets]
      .filter((row) => !normalizedQuery || row.question.toLowerCase().includes(normalizedQuery) || row.event_title.toLowerCase().includes(normalizedQuery))
      .filter((row) => !tag || row.tags.includes(tag))
      .sort((left, right) => valueForSort(right, sort) - valueForSort(left, sort));
  }, [hunter.markets, query, sort, tag]);

  const selectedMarket = rows.find((row) => row.market_id === selectedMarketId) ?? rows[0] ?? null;

  return (
    <div className="stack">
      <article className="panel compact-panel">
        <div className="metric-row">
          <strong>Polymarket Hunter</strong>
          <span>
            {hunter.source_status} / {formatDateTimeIST(hunter.generated_at)}
          </span>
        </div>
        <p className="compact-copy">{hunter.source_note}</p>
        <p className="compact-copy">Default discovery shows active unresolved trader-relevant markets first. Use search or tags to widen the net.</p>
        <div className="control-row">
          <input
            aria-label="Search Polymarket markets"
            className="text-input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search question or event"
            type="search"
            value={query}
          />
          <select aria-label="Filter Polymarket tag" className="select-input" onChange={(event) => setTag(event.target.value)} value={tag}>
            <option value="">All tags</option>
            {hunter.available_tags.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select aria-label="Sort Polymarket markets" className="select-input" onChange={(event) => setSort(event.target.value)} value={sort}>
            <option value="relevance">Relevance</option>
            <option value="volume">Volume</option>
            <option value="liquidity">Liquidity</option>
            <option value="recent">Recent activity</option>
          </select>
        </div>
      </article>

      <div className="split-stack polymarket-hunter-layout">
        <article className="panel compact-panel">
          {loading ? (
            <StateBlock loading />
          ) : error ? (
            <StateBlock error="Polymarket data source is unavailable right now." />
          ) : rows.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Question</th>
                  <th>Tag</th>
                  <th>Category</th>
                  <th>Odds</th>
                  <th>Volume</th>
                  <th>Liquidity</th>
                  <th>Recent</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const headlineOutcome = row.outcomes[0];
                  return (
                    <tr
                      className={selectedMarket?.market_id === row.market_id ? "row-selected" : ""}
                      key={row.market_id}
                      onClick={() => {
                        setSelectedMarketId(row.market_id);
                        if (row.related_assets[0]) {
                          onSelectSymbol(row.related_assets[0]);
                        }
                      }}
                    >
                      <td>
                        <strong>{row.question}</strong>
                        <div className="mini-copy">{row.event_title}</div>
                      </td>
                      <td>{row.primary_tag || "n/a"}</td>
                      <td>{row.category.replace(/_/g, " ")}</td>
                      <td>{headlineOutcome ? `${headlineOutcome.label} ${(headlineOutcome.probability * 100).toFixed(0)}%` : "n/a"}</td>
                      <td>{row.volume.toLocaleString()}</td>
                      <td>{row.liquidity.toLocaleString()}</td>
                      <td>{row.recent_activity.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <StateBlock
              empty
              emptyLabel={
                query || tag
                  ? "No relevant crowd markets match the current filter."
                  : "No trader-relevant crowd markets are available in the current source."
              }
            />
          )}
        </article>

        <article className="panel compact-panel">
          {loading ? (
            <StateBlock loading />
          ) : error ? (
            <StateBlock error="Polymarket detail is unavailable until the current source recovers." />
          ) : selectedMarket ? (
            <div className="stack">
              <div className="metric-row">
                <strong>{selectedMarket.question}</strong>
                <span>{selectedMarket.status}</span>
              </div>
              <div className="metric-row compact-row">
                <span>{selectedMarket.primary_tag || "n/a"}</span>
                <span>{selectedMarket.event_title}</span>
              </div>
              <div className="metric-row compact-row">
                <span>{selectedMarket.category.replace(/_/g, " ")}</span>
                <span>relevance {selectedMarket.relevance_score.toFixed(1)}</span>
              </div>
              <div className="metric-row compact-row">
                <span>Volume {selectedMarket.volume.toLocaleString()}</span>
                <span>Liquidity {selectedMarket.liquidity.toLocaleString()}</span>
              </div>
              <div className="metric-row compact-row">
                <span>Recent {selectedMarket.recent_activity.toLocaleString()}</span>
                <span>End {selectedMarket.end_date ? formatDateTimeIST(selectedMarket.end_date) : "open"}</span>
              </div>
              <div className="inline-tags">
                {selectedMarket.tags.map((item) => (
                  <span className="tag" key={item}>
                    {item}
                  </span>
                ))}
              </div>
              <div className="stack">
                {selectedMarket.outcomes.map((item) => (
                  <div className="metric-row compact-row" key={item.label}>
                    <span>{item.label}</span>
                    <span>{(item.probability * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
              <small>{selectedMarket.relevance_reason}</small>
              <small>{selectedMarket.source_note}</small>
              {selectedMarket.related_assets[0] ? (
                <button className="text-button" onClick={() => onSelectSymbol(selectedMarket.related_assets[0])} type="button">
                  Focus {selectedMarket.related_assets[0]}
                </button>
              ) : null}
              <a href={selectedMarket.url} rel="noreferrer" target="_blank">
                Open Polymarket
              </a>
            </div>
          ) : (
            <StateBlock empty emptyLabel="No trader-relevant crowd markets are available to inspect right now." />
          )}
        </article>
      </div>
    </div>
  );
}
