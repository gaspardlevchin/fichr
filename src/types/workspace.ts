export const workspaceRoles = ["owner", "admin", "editor", "viewer"] as const;

export type WorkspaceRole = (typeof workspaceRoles)[number];

export const workspaceRoleLabels: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer"
};
