import type { ReactNode } from "react";

interface PanelProps {
  title?: string;
  eyebrow?: string;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, eyebrow, extra, children, className = "" }: PanelProps) {
  return (
    <section className={`panel ${className}`.trim()}>
      {title || eyebrow || extra ? (
        <div className="panel-header">
          <div>
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            {title ? <h2>{title}</h2> : null}
          </div>
          {extra ? <div>{extra}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
