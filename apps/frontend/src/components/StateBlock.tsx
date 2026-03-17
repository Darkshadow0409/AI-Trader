interface StateBlockProps {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyLabel?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function StateBlock({ loading, error, empty, emptyLabel = "No data available.", actionLabel, onAction }: StateBlockProps) {
  if (loading) {
    return <div className="state-block">Loading…</div>;
  }
  if (error) {
    return (
      <div className="state-block state-error">
        <div>{error}</div>
        {actionLabel && onAction ? (
          <button className="text-button state-action" onClick={onAction} type="button">
            {actionLabel}
          </button>
        ) : null}
      </div>
    );
  }
  if (empty) {
    return (
      <div className="state-block">
        <div>{emptyLabel}</div>
        {actionLabel && onAction ? (
          <button className="text-button state-action" onClick={onAction} type="button">
            {actionLabel}
          </button>
        ) : null}
      </div>
    );
  }
  return null;
}
