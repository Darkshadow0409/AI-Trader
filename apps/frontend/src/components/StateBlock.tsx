interface StateBlockProps {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyLabel?: string;
}

export function StateBlock({ loading, error, empty, emptyLabel = "No data available." }: StateBlockProps) {
  if (loading) {
    return <div className="state-block">Loading…</div>;
  }
  if (error) {
    return <div className="state-block state-error">{error}</div>;
  }
  if (empty) {
    return <div className="state-block">{emptyLabel}</div>;
  }
  return null;
}
