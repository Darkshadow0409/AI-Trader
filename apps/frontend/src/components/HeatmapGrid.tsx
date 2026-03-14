import type { HeatmapView } from "../types/api";

interface HeatmapGridProps {
  heatmap: HeatmapView | null;
}

function heatmapColor(value: number, maxValue: number, minValue: number): string {
  if (maxValue === minValue) {
    return "rgba(41, 92, 157, 0.4)";
  }
  const ratio = (value - minValue) / (maxValue - minValue);
  const alpha = 0.22 + ratio * 0.5;
  return `rgba(110, 228, 167, ${alpha.toFixed(2)})`;
}

export function HeatmapGrid({ heatmap }: HeatmapGridProps) {
  if (!heatmap) {
    return <p className="muted-copy">No parameter stability heatmap is available for this run.</p>;
  }

  const flattened = heatmap.values.flat();
  const maxValue = Math.max(...flattened);
  const minValue = Math.min(...flattened);

  return (
    <div className="heatmap-shell">
      <div className="metric-row">
        <span>X: {heatmap.x_param}</span>
        <span>Y: {heatmap.y_param}</span>
      </div>
      <div className="heatmap-grid" style={{ gridTemplateColumns: `140px repeat(${heatmap.x_labels.length}, minmax(64px, 1fr))` }}>
        <div className="heatmap-label heatmap-corner">Objective</div>
        {heatmap.x_labels.map((label) => (
          <div className="heatmap-label" key={`x-${label}`}>
            {label}
          </div>
        ))}
        {heatmap.y_labels.map((label, rowIndex) => (
          <div className="heatmap-row" key={`row-${label}`}>
            <div className="heatmap-label">{label}</div>
            {heatmap.values[rowIndex].map((value, columnIndex) => (
              <div
                className="heatmap-cell"
                key={`${label}-${heatmap.x_labels[columnIndex]}`}
                style={{ background: heatmapColor(value, maxValue, minValue) }}
                title={`${heatmap.y_param}=${label}, ${heatmap.x_param}=${heatmap.x_labels[columnIndex]}: ${value.toFixed(2)}`}
              >
                {value.toFixed(1)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
