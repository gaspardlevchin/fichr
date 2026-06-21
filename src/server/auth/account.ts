import { eq } from "drizzle-orm";

import { users, workspaceMembers, workspaces } from "../../../db/schema";
import { db } from "@/server/db/client";
import { createServerId } from "@/server/ids";

export function ensurePrivateBetaAccount(email: string): string {
  const existingUser = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
    .get();

  const userId = existingUser?.id ?? createServerId("usr");
  const existingMembership = existingUser
    ? db
        .select({ id: workspaceMembers.id })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.userId, userId))
        .limit(1)
        .get()
    : null;

  if (existingMembership) {
    return userId;
  }

  db.transaction((tx) => {
    if (!existingUser) {
      tx.insert(users)
        .values({
          email,
          id: userId,
          name: null,
          provider: null,
          providerAccountId: null
        })
        .run();
    }

    const workspaceId = createServerId("wks");

    tx.insert(workspaces)
      .values({
        id: workspaceId,
        name: "Workspace Fichr",
        ownerUserId: userId
      })
      .run();

    tx.insert(workspaceMembers)
      .values({
        id: createServerId("wmb"),
        role: "owner",
        userId,
        workspaceId
      })
      .run();
  });

  return userId;
}
