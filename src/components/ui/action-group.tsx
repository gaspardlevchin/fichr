import type { ReactNode } from "react";

export function ActionGroup({ children }: { children: ReactNode }) {
  return <div className="action-group">{children}</div>;
}
