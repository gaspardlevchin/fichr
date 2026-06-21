import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { workspaceMembers } from "../../../db/schema";
import { resolveWorkspaceAccess } from "@/server/auth/access-core";
import { getCurrentSession } from "@/server/auth/session";
import { db } from "@/server/db/client";
import type { WorkspaceAccess } from "@/types/auth";
import type { WorkspaceRole } from "@/types/workspace";

export async function requireWorkspaceAccess(
  allowedRoles: readonly WorkspaceRole[] = [
    "owner",
    "admin",
    "editor",
    "viewer"
  ]
): Promise<WorkspaceAccess> {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/login");
  }

  const memberships = db
    .select({
      role: workspaceMembers.role,
      workspaceId: workspaceMembers.workspaceId
    })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, session.userId))
    .orderBy(asc(workspaceMembers.createdAt))
    .all();

  const access = resolveWorkspaceAccess(
    session.userId,
    memberships,
    allowedRoles
  );

  if (!access) {
    redirect("/access-denied");
  }

  return access;
}
