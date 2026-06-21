import type { ReactNode } from "react";

export function EmptyState({
  action,
  contained = false,
  description,
  label,
  title
}: {
  action?: ReactNode;
  contained?: boolean;
  description: string;
  label: string;
  title: string;
}) {
  return (
    <section
      className={contained ? "empty-inline-state" : "empty-panel"}
      aria-label={label}
    >
      <p className="empty-title">{title}</p>
      <p className="muted-text">{description}</p>
      {action ? <div className="empty-state-actions">{action}</div> : null}
    </section>
  );
}
