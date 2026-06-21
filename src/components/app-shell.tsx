import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { appNavigationItems } from "@/lib/app-navigation";
import { getCurrentSession } from "@/server/auth/session";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getWorkspaceEntitlements } from "@/server/entitlements/service";
import { getFichrPlan } from "@/server/entitlements/plans";

type AppShellProps = {
  children: ReactNode;
};

export async function AppShell({ children }: AppShellProps) {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/login");
  }

  const access = await requireWorkspaceAccess();
  const entitlement = getWorkspaceEntitlements(access.workspaceId);

  return (
    <div className="app-shell">
      <AppHeader
        navigationItems={appNavigationItems}
        planLabel={getFichrPlan(entitlement.effectivePlanKey).label}
        planStatus={entitlement.status}
        session={session}
      />
      <main className="app-main">{children}</main>
    </div>
  );
}
