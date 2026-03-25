import { useMemo, useState } from "react";
import type { SignalView } from "../types/api";

interface SignalTableProps {
  rows: SignalView[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  onSelectSignal?: (signalId: string) => void;
}

type SortKey = "score" | "confidence" | "freshness" | "noise" | "symbol";

function asString(value: unknown, fallback = "n/a"): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function riskTier(row: SignalView): string {
  if (row.noise_probability >= 0.35 || row.data_reality?.freshness_state === "stale") {
    return "high";
  }
  if (row.noise_probability >= 0.2 || row.data_reality?.provenance.realism_grade === "C") {
    return "medium";
  }
  return "low";
}

function horizon(row: SignalView): string {
  const trigger = asString(row.features.trigger_timeframe, "");
  if (row.signal_type === "event_driven") {
    return "event";
  }
  if (trigger.includes("1m") || trigger.includes("5m")) {
    return "intraday";
  }
  if ((row.features.breakout_distance as number | undefined) !== undefined) {
    return "swing";
  }
  return "daily";
}

function filterMatch(value: string, selected: string): boolean {
  return selected === "all" || value === selected;
}

export function SignalTable({ rows, selectedSymbol, onSelectSymbol, onSelectSignal }: SignalTableProps) {
  const [assetFilter, setAssetFilter] = useState("all");
  const [familyFilter, setFamilyFilter] = useState("all");
  const [horizonFilter, setHorizonFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [realismFilter, setRealismFilter] = useState("all");
  const [freshnessFilter, setFreshnessFilter] = useState("all");
  const [scoreFloor, setScoreFloor] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("score");

  const filteredRows = useMemo(() => {
    const next = rows.filter((row) => {
      const reality = row.data_reality;
      return (
        filterMatch(row.symbol, assetFilter) &&
        filterMatch(row.signal_type, familyFilter) &&
        filterMatch(horizon(row), horizonFilter) &&
        filterMatch(riskTier(row), riskFilter) &&
        filterMatch(reality?.provenance.realism_grade ?? "unknown", realismFilter) &&
        filterMatch(reality?.freshness_state ?? "unknown", freshnessFilter) &&
        row.score >= scoreFloor
      );
    });
    const ranked = [...next];
    ranked.sort((left, right) => {
      switch (sortKey) {
        case "symbol":
          return left.symbol.localeCompare(right.symbol);
        case "confidence":
          return right.confidence - left.confidence;
        case "freshness":
          return left.freshness_minutes - right.freshness_minutes;
        case "noise":
          return right.noise_probability - left.noise_probability;
        case "score":
        default:
          return right.score - left.score;
      }
    });
    return ranked;
  }, [assetFilter, familyFilter, freshnessFilter, horizonFilter, realismFilter, riskFilter, rows, scoreFloor, sortKey]);

  const assets = Array.from(new Set(rows.map((row) => row.symbol)));
  const families = Array.from(new Set(rows.map((row) => row.signal_type)));

  return (
    <div className="signal-workbench">
      <div className="filter-bar">
        <label className="field compact-field">
          <span>Asset</span>
          <select value={assetFilter} onChange={(event) => setAssetFilter(event.target.value)}>
            <option value="all">all</option>
            {assets.map((asset) => (
              <option key={asset} value={asset}>
                {asset}
              </option>
            ))}
          </select>
        </label>
        <label className="field compact-field">
          <span>Family</span>
          <select value={familyFilter} onChange={(event) => setFamilyFilter(event.target.value)}>
            <option value="all">all</option>
            {families.map((family) => (
              <option key={family} value={family}>
                {family}
              </option>
            ))}
          </select>
        </label>
        <label className="field compact-field">
          <span>Horizon</span>
          <select value={horizonFilter} onChange={(event) => setHorizonFilter(event.target.value)}>
            <option value="all">all</option>
            <option value="event">event</option>
            <option value="intraday">intraday</option>
            <option value="swing">swing</option>
            <option value="daily">daily</option>
          </select>
        </label>
        <label className="field compact-field">
          <span>Risk Tier</span>
          <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
            <option value="all">all</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>
        <label className="field compact-field">
          <span>Realism</span>
          <select value={realismFilter} onChange={(event) => setRealismFilter(event.target.value)}>
            <option value="all">all</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="D">D</option>
          </select>
        </label>
        <label className="field compact-field">
          <span>Freshness</span>
          <select value={freshnessFilter} onChange={(event) => setFreshnessFilter(event.target.value)}>
            <option value="all">all</option>
            <option value="fresh">fresh</option>
            <option value="aging">aging</option>
            <option value="stale">stale</option>
            <option value="degraded">degraded</option>
            <option value="unusable">unusable</option>
          </select>
        </label>
        <label className="field compact-field">
          <span>Score Floor</span>
          <input max={100} min={0} onChange={(event) => setScoreFloor(Number(event.target.value))} type="number" value={scoreFloor} />
        </label>
        <label className="field compact-field">
          <span>Sort</span>
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
            <option value="score">score</option>
            <option value="confidence">confidence</option>
            <option value="freshness">freshness</option>
            <option value="noise">noise</option>
            <option value="symbol">symbol</option>
          </select>
        </label>
      </div>

      <table className="data-table signal-table">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Family</th>
            <th>Status</th>
            <th>Regime</th>
            <th>Score</th>
            <th>Conf.</th>
            <th>Entry / Stop</th>
            <th>Targets</th>
            <th>Fresh</th>
            <th>Reality</th>
            <th>Why now</th>
          </tr>
        </thead>
        <tbody>
          {filteredRows.map((row) => (
            <tr
              className={row.symbol === selectedSymbol ? "row-selected" : ""}
              key={`${row.signal_id}-${row.timestamp}`}
              onClick={() => {
                onSelectSymbol(row.symbol);
                onSelectSignal?.(row.signal_id);
              }}
            >
              <td>{row.symbol}</td>
              <td>{asString(row.features.setup_family, row.signal_type).replace(/_/g, " ")}</td>
              <td>{asString(row.features.setup_status, "candidate").replace(/_/g, " ")}</td>
              <td>{asString(row.features.regime, "mixed").replace(/_/g, " ")}</td>
              <td>{row.score.toFixed(1)}</td>
              <td>{(row.confidence * 100).toFixed(0)}%</td>
              <td>
                {asNumber((row.features.entry_zone as { low?: number } | undefined)?.low)?.toFixed(2) ?? "n/a"}
                {" / "}
                {row.invalidation.toFixed(2)}
              </td>
              <td>
                {row.targets.base?.toFixed(2)} / {row.targets.stretch?.toFixed(2)}
              </td>
              <td>{row.data_reality?.freshness_state ?? "n/a"}</td>
              <td>
                {(row.data_reality?.provenance.realism_grade ?? "n/a")} / {riskTier(row)}
              </td>
              <td>{Array.isArray(row.features.why_now) ? String(row.features.why_now[0] ?? row.thesis) : row.thesis}</td>
            </tr>
          ))}
          {filteredRows.length === 0 ? (
            <tr>
              <td colSpan={11}>
                <p className="muted-copy">No signals match the current operator filters.</p>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
