import type {
  CommodityTruthStatusView,
  DataRealityView,
  InstrumentMappingView,
  MarketChartView,
  RecoveryTelemetryView,
} from "../types/api";
import { resolveRealityStrip } from "../lib/realityStrip";

interface RealityStripProps {
  chart?: Pick<MarketChartView, "freshness_minutes" | "freshness_state" | "status_note"> | null;
  commodityTruth?: CommodityTruthStatusView | null;
  reality?: DataRealityView | null;
  recovery?: RecoveryTelemetryView | null;
  mapping?: Pick<InstrumentMappingView, "trader_symbol" | "research_symbol"> | null;
  className?: string;
}

export function RealityStrip({
  chart = null,
  commodityTruth = null,
  reality = null,
  recovery = null,
  mapping = null,
  className = "",
}: RealityStripProps) {
  const model = resolveRealityStrip({
    chart,
    commodityTruth,
    reality,
    recovery,
    mapping,
  });

  return (
    <div className={`reality-strip ${className}`.trim()} data-testid="reality-strip">
      {model.slots.map((slot) => (
        <div className={`reality-strip-slot tone-${slot.tone}`} key={slot.label}>
          <span className="metric-label">{slot.label}</span>
          <strong>{slot.value}</strong>
          <small>{slot.note}</small>
        </div>
      ))}
    </div>
  );
}
