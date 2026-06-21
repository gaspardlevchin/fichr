import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { products, spaces } from "../../../db/schema";
import { logEvent } from "@/server/audit/event-log";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { db } from "@/server/db/client";
import {
  assertFeatureAllowed,
  assertQuotaAvailable
} from "@/server/entitlements/service";
import { createServerId } from "@/server/ids";
import {
  normalizeSpaceDescription,
  normalizeSpaceName
} from "@/server/spaces/core";

const spaceWriteRoles = ["owner", "admin", "editor"] as const;

export async function createWorkspaceSpace(input: {
  description: string;
  name: string;
}): Promise<{ id: string; name: string }> {
  const access = await requireWorkspaceAccess(spaceWriteRoles);
  assertFeatureAllowed(access.workspaceId, "create_space");
  assertQuotaAvailable(access.workspaceId, "maxSpaces");
  const name = normalizeSpaceName(input.name);
  const description = normalizeSpaceDescription(input.description);
  const spaceId = createServerId("spc");

  db.insert(spaces)
    .values({
      description,
      id: spaceId,
      name,
      workspaceId: access.workspaceId
    })
    .run();

  logEvent({
    workspaceId: access.workspaceId,
    actorUserId: access.userId,
    action: "space.create",
    entityType: "space",
    entityId: spaceId,
    metadata: {
      space_id: spaceId,
      status: "active"
    }
  });

  return { id: spaceId, name };
}

export async function assignProductToSpace(input: {
  productId: string;
  spaceId: string | null;
}): Promise<{ productId: string; spaceId: string | null }> {
  const access = await requireWorkspaceAccess(spaceWriteRoles);
  const product = db
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        eq(products.id, input.productId),
        eq(products.workspaceId, access.workspaceId),
        isNull(products.deletedAt)
      )
    )
    .limit(1)
    .get();

  if (!product) {
    throw new Error("Fiche active introuvable pour ce workspace.");
  }

  if (input.spaceId) {
    const targetSpace = db
      .select({ id: spaces.id })
      .from(spaces)
      .where(
        and(
          eq(spaces.id, input.spaceId),
          eq(spaces.workspaceId, access.workspaceId),
          isNull(spaces.deletedAt)
        )
      )
      .limit(1)
      .get();

    if (!targetSpace) {
      throw new Error("Espace introuvable pour ce workspace.");
    }
  }

  const assignment = db
    .update(products)
    .set({
      spaceId: input.spaceId,
      updatedAt: sql`CURRENT_TIMESTAMP`
    })
    .where(
      and(
        eq(products.id, input.productId),
        eq(products.workspaceId, access.workspaceId),
        isNull(products.deletedAt)
      )
    )
    .run();

  if (assignment.changes !== 1) {
    throw new Error("L’espace de la fiche n’a pas pu être mis à jour.");
  }

  logEvent({
    workspaceId: access.workspaceId,
    actorUserId: access.userId,
    action: "product.space.update",
    entityType: "product",
    entityId: input.productId,
    metadata: {
      product_id: input.productId,
      space_id: input.spaceId,
      status: input.spaceId ? "assigned" : "unassigned"
    }
  });

  return {
    productId: input.productId,
    spaceId: input.spaceId
  };
}

export async function archiveWorkspaceSpace(spaceId: string): Promise<{
  spaceId: string;
  status: "archived";
}> {
  const access = await requireWorkspaceAccess(spaceWriteRoles);
  const archived = db
    .update(spaces)
    .set({
      deletedAt: sql`CURRENT_TIMESTAMP`,
      updatedAt: sql`CURRENT_TIMESTAMP`
    })
    .where(
      and(
        eq(spaces.id, spaceId),
        eq(spaces.workspaceId, access.workspaceId),
        isNull(spaces.deletedAt)
      )
    )
    .run();

  if (archived.changes !== 1) {
    throw new Error("Espace actif introuvable pour ce workspace.");
  }

  logEvent({
    workspaceId: access.workspaceId,
    actorUserId: access.userId,
    action: "space.archive",
    entityType: "space",
    entityId: spaceId,
    metadata: {
      space_id: spaceId,
      status: "archived"
    }
  });

  return { spaceId, status: "archived" };
}

export async function restoreWorkspaceSpace(spaceId: string): Promise<{
  spaceId: string;
  status: "active";
}> {
  const access = await requireWorkspaceAccess(spaceWriteRoles);
  const restored = db
    .update(spaces)
    .set({
      deletedAt: null,
      updatedAt: sql`CURRENT_TIMESTAMP`
    })
    .where(
      and(
        eq(spaces.id, spaceId),
        eq(spaces.workspaceId, access.workspaceId),
        isNotNull(spaces.deletedAt)
      )
    )
    .run();

  if (restored.changes !== 1) {
    throw new Error("Espace archivé introuvable pour ce workspace.");
  }

  logEvent({
    workspaceId: access.workspaceId,
    actorUserId: access.userId,
    action: "space.restore",
    entityType: "space",
    entityId: spaceId,
    metadata: {
      space_id: spaceId,
      status: "active"
    }
  });

  return { spaceId, status: "active" };
}
