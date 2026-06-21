import type { WorkspaceAccess } from "../../types/auth";
import type { WorkspaceRole } from "../../types/workspace";

type MembershipCandidate = {
  role: WorkspaceRole;
  workspaceId: string;
};

export function resolveWorkspaceAccess(
  userId: string,
  memberships: readonly MembershipCandidate[],
  allowedRoles: readonly WorkspaceRole[]
): WorkspaceAccess | null {
  const membership = memberships.find((candidate) =>
    allowedRoles.includes(candidate.role)
  );

  if (!membership) {
    return null;
  }

  return {
    role: membership.role,
    userId,
    workspaceId: membership.workspaceId
  };
}
