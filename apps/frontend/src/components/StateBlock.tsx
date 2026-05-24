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
    return (
      <div className="state-block state-loading" role="status">
        <strong className="state-block-title">Syncing operator data…</strong>
        <small className="state-block-detail">Refreshing the current workspace without hiding the last honest state.</small>
      </div>
    );
  }
  if (error) {
    return (
      <div className="state-block state-error">
        <strong className="state-block-title">Operator attention needed</strong>
        <div className="state-block-detail">{error}</div>
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
        <strong className="state-block-title">Nothing active yet</strong>
        <div className="state-block-detail">{emptyLabel}</div>
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
