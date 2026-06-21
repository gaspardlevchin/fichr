import type { WorkspaceRole } from "./workspace";

export type SessionContext = {
  email: string;
  sessionId: string;
  name: string | null;
  userId: string;
  expiresAt: string;
};

export type WorkspaceAccess = {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
};
