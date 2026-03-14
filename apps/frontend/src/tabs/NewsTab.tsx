import type { NewsView } from "../types/api";

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
            <span>{new Date(item.published_at).toLocaleString()}</span>
          </div>
          <p className="compact-copy">{item.summary}</p>
          <div className="inline-tags">
            {item.entity_tags.map((tag) => (
              <span className="tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
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
