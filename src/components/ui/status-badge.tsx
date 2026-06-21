import type { ReactNode } from "react";

export function StatusBadge({
  children,
  status = "neutral"
}: {
  children: ReactNode;
  status?: string;
}) {
  return (
    <span className={`status-pill status-${status}`}>{children}</span>
  );
}
