import { useMemo, useState } from "react";
import type { CommodityTruthStatusView, SignalView } from "../types/api";
import { commodityTruthIsReadyCurrent, commodityTruthStateLabel, commodityTruthSummaryLabel, traderFreshnessLabel, traderFreshnessStateLabel } from "../lib/uiLabels";

interface SignalTableProps {
  rows: SignalView[];
  highRiskRows?: SignalView[];
  commodityTruth?: CommodityTruthStatusView | null;
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  onSelectSignal?: (signalId: string) => void;
}

type SortKey = "score" | "confidence" | "freshness" | "noise" | "symbol";
type ScopeKey = "board" | "all";

const PRIMARY_COMMODITY_SYMBOLS = new Set(["WTI", "GOLD", "SILVER"]);

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

function setupStatus(row: SignalView): string {
  return asString(row.features.setup_status, "candidate");
}

function isPrimaryBoardSignal(row: SignalView): boolean {
  return PRIMARY_COMMODITY_SYMBOLS.has(row.symbol);
}

function chartTruthLine(row: SignalView, commodityTruth: CommodityTruthStatusView | null | undefined): string {
  if (isPrimaryBoardSignal(row) && commodityTruth && !commodityTruthIsReadyCurrent(commodityTruth)) {
    if (commodityTruth.truth_state === "ready_last_verified") {
      return `Paper / last verified / ${row.data_reality?.provenance.realism_grade ?? "n/a"}`;
    }
    return `Research only / ${row.data_reality?.provenance.realism_grade ?? "n/a"}`;
  }
  return `${row.data_reality?.execution_grade_allowed ? "Execution-capable" : "Research only"} / ${row.data_reality?.provenance.realism_grade ?? "n/a"}`;
}

function traderSymbol(row: SignalView): string {
  return row.display_symbol ?? row.data_reality?.provenance.tradable_symbol ?? row.symbol;
}

function filterMatch(value: string, selected: string): boolean {
  return selected === "all" || value === selected;
}

function matchesScope(row: SignalView, scope: ScopeKey): boolean {
  return scope === "all" || isPrimaryBoardSignal(row);
}

function sortRows(rows: SignalView[], sortKey: SortKey): SignalView[] {
  const ranked = [...rows];
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
}

function rowMatchesFilters(
  row: SignalView,
  scope: ScopeKey,
  assetFilter: string,
  familyFilter: string,
  horizonFilter: string,
  riskFilter: string,
  realismFilter: string,
  freshnessFilter: string,
  scoreFloor: number,
): boolean {
  const reality = row.data_reality;
  return (
    matchesScope(row, scope) &&
    filterMatch(row.symbol, assetFilter) &&
    filterMatch(row.signal_type, familyFilter) &&
    filterMatch(horizon(row), horizonFilter) &&
    filterMatch(riskTier(row), riskFilter) &&
    filterMatch(reality?.provenance.realism_grade ?? "unknown", realismFilter) &&
    filterMatch(traderFreshnessStateLabel(reality?.freshness_state ?? "unknown", reality?.execution_grade_allowed), freshnessFilter) &&
    row.score >= scoreFloor
  );
}

function SignalRowsTable({
  rows,
  commodityTruth,
  selectedSymbol,
  onSelectSignal,
  onSelectSymbol,
}: {
  rows: SignalView[];
  commodityTruth?: CommodityTruthStatusView | null;
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  onSelectSignal?: (signalId: string) => void;
}) {
  return (
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
          <th>Freshness</th>
          <th>Chart Truth</th>
          <th>Why now</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            className={row.symbol === selectedSymbol ? "row-selected" : ""}
            key={`${row.signal_id}-${row.timestamp}`}
            onClick={() => {
              onSelectSymbol(row.symbol);
              onSelectSignal?.(row.signal_id);
            }}
          >
            <td>{traderSymbol(row)}</td>
            <td>{asString(row.features.setup_family, row.signal_type).replace(/_/g, " ")}</td>
            <td>{setupStatus(row).replace(/_/g, " ")}</td>
            <td>{asString(row.features.regime, "mixed").replace(/_/g, " ")}</td>
            <td>{row.score.toFixed(1)}</td>
            <td>{(row.confidence * 100).toFixed(0)}%</td>
            <td>
              {asNumber((row.features.entry_zone as { low?: number } | undefined)?.low)?.toFixed(2) ?? "n/a"}
              {" / "}
              {row.invalidation.toFixed(2)}
            </td>
            <td>{traderFreshnessLabel(row.data_reality?.freshness_minutes ?? row.freshness_minutes, row.data_reality?.freshness_state ?? "unknown", row.data_reality?.execution_grade_allowed)}</td>
            <td>
              {chartTruthLine(row, commodityTruth)}
            </td>
            <td>{Array.isArray(row.features.why_now) ? String(row.features.why_now[0] ?? row.thesis) : row.thesis}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SignalSection({
  title,
  eyebrow,
  rows,
  commodityTruth,
  emptyLabel,
  selectedSymbol,
  onSelectSignal,
  onSelectSymbol,
}: {
  title: string;
  eyebrow: string;
  rows: SignalView[];
  commodityTruth?: CommodityTruthStatusView | null;
  emptyLabel: string;
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  onSelectSignal?: (signalId: string) => void;
}) {
  return (
    <article className="panel compact-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
        </div>
        <span className="tag">{rows.length}</span>
      </div>
      {rows.length > 0 ? (
        <SignalRowsTable
          commodityTruth={commodityTruth}
          onSelectSignal={onSelectSignal}
          onSelectSymbol={onSelectSymbol}
          rows={rows}
          selectedSymbol={selectedSymbol}
        />
      ) : (
        <p className="muted-copy">{emptyLabel}</p>
      )}
    </article>
  );
}

export function SignalTable({ rows, highRiskRows = [], commodityTruth = null, selectedSymbol, onSelectSymbol, onSelectSignal }: SignalTableProps) {
  const [scope, setScope] = useState<ScopeKey>("board");
  const [assetFilter, setAssetFilter] = useState("all");
  const [familyFilter, setFamilyFilter] = useState("all");
  const [horizonFilter, setHorizonFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [realismFilter, setRealismFilter] = useState("all");
  const [freshnessFilter, setFreshnessFilter] = useState("all");
  const [scoreFloor, setScoreFloor] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("score");

  const assets = Array.from(new Set(rows.map((row) => row.symbol)));
  const families = Array.from(new Set(rows.map((row) => row.signal_type)));

  const filteredRows = useMemo(() => {
    const next = rows.filter((row) =>
      rowMatchesFilters(row, scope, assetFilter, familyFilter, horizonFilter, riskFilter, realismFilter, freshnessFilter, scoreFloor),
    );
    return sortRows(next, sortKey);
  }, [assetFilter, familyFilter, freshnessFilter, horizonFilter, realismFilter, riskFilter, rows, scope, scoreFloor, sortKey]);

  const filteredHighRiskRows = useMemo(() => {
    const direct = highRiskRows.filter((row) =>
      rowMatchesFilters(row, scope, assetFilter, familyFilter, horizonFilter, riskFilter, realismFilter, freshnessFilter, scoreFloor),
    );
    if (direct.length > 0) {
      return sortRows(direct, sortKey);
    }
    return sortRows(
      rows.filter((row) =>
        rowMatchesFilters(row, scope, assetFilter, familyFilter, horizonFilter, riskFilter, realismFilter, freshnessFilter, scoreFloor)
        && riskTier(row) === "high",
      ),
      sortKey,
    );
  }, [assetFilter, familyFilter, freshnessFilter, highRiskRows, horizonFilter, realismFilter, riskFilter, rows, scope, scoreFloor, sortKey]);

  const highRiskIds = useMemo(() => new Set(filteredHighRiskRows.map((row) => row.signal_id)), [filteredHighRiskRows]);
  const actionableRows = useMemo(
    () => filteredRows.filter((row) => setupStatus(row) === "actionable" && !highRiskIds.has(row.signal_id)),
    [filteredRows, highRiskIds],
  );
  const candidateRows = useMemo(
    () => filteredRows.filter((row) => setupStatus(row) !== "actionable" && !highRiskIds.has(row.signal_id)),
    [filteredRows, highRiskIds],
  );
  const hasSourceRows = rows.length > 0 || highRiskRows.length > 0;
  const hasFilteredRows = actionableRows.length > 0 || candidateRows.length > 0 || filteredHighRiskRows.length > 0;
  const guidanceLabel = hasSourceRows
    ? "Current filters removed the loaded setups. Switch to All assets or loosen the score floor to see the full board."
    : "No live or seeded setups are currently in scope. Stay in chart, news, and risk review mode until the next scan completes.";

  return (
    <div className="signal-workbench">
      <article className="panel compact-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Operator Board</p>
            <h3>Commodity Setup Hunter</h3>
          </div>
          <div className="inline-tags">
            <button className={scope === "board" ? "pill active" : "pill"} onClick={() => setScope("board")} type="button">
              Commodity board
            </button>
            <button className={scope === "all" ? "pill active" : "pill"} onClick={() => setScope("all")} type="button">
              All assets
            </button>
          </div>
        </div>
        <small className="compact-copy">
          Signals default to the primary commodity board first. High-risk and event-sensitive setups stay visible in the same workflow instead of hiding in a separate tab.
        </small>
        {commodityTruth && !commodityTruthIsReadyCurrent(commodityTruth) ? (
          <div className="state-block">
            <strong>{commodityTruthStateLabel(commodityTruth)}</strong>
            <div>{commodityTruthSummaryLabel(commodityTruth)}</div>
          </div>
        ) : null}
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
              <option value="degraded truth">degraded truth</option>
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
      </article>

      {!hasFilteredRows ? (
        <article className="panel compact-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Operator Guidance</p>
              <h3>Setups Not In Scope</h3>
            </div>
          </div>
          <p className="muted-copy">{guidanceLabel}</p>
        </article>
      ) : null}

      <SignalSection
        emptyLabel="No actionable setups are currently loaded for the selected operator scope."
        eyebrow="Execution-Ready First"
        commodityTruth={commodityTruth}
        onSelectSignal={onSelectSignal}
        onSelectSymbol={onSelectSymbol}
        rows={actionableRows}
        selectedSymbol={selectedSymbol}
        title="Actionable commodity setups"
      />

      <SignalSection
        emptyLabel="No candidate or confirmation-needed setups are currently loaded for the selected scope."
        eyebrow="Needs Confirmation"
        commodityTruth={commodityTruth}
        onSelectSignal={onSelectSignal}
        onSelectSymbol={onSelectSymbol}
        rows={candidateRows}
        selectedSymbol={selectedSymbol}
        title="Needs confirmation / candidate setups"
      />

      <SignalSection
        emptyLabel="No high-risk or event-sensitive setups are currently flagged for this scope."
        eyebrow="Event-Sensitive"
        commodityTruth={commodityTruth}
        onSelectSignal={onSelectSignal}
        onSelectSymbol={onSelectSymbol}
        rows={filteredHighRiskRows}
        selectedSymbol={selectedSymbol}
        title="High-risk / event-sensitive setups"
      />
    </div>
  );
}
