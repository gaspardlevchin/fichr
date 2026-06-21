import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { products } from "../../../db/schema";
import { logEvent } from "@/server/audit/event-log";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { db } from "@/server/db/client";
import { assertProductDeletionConfirmation } from "@/server/products/product-mutation-core";

const productDeleteRoles = ["owner", "admin"] as const;

export async function deleteProductWithConfirmation(input: {
  confirmation: string;
  productId: string;
}): Promise<{
  productId: string;
  previousStatus: string;
  status: "deleted";
}> {
  const access = await requireWorkspaceAccess(productDeleteRoles);
  const product = db
    .select({
      status: products.status,
      title: products.title
    })
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
    throw new Error("Fiche produit introuvable pour ce workspace.");
  }

  assertProductDeletionConfirmation({
    confirmation: input.confirmation,
    title: product.title
  });

  const deletion = db
    .update(products)
    .set({
      deletedAt: sql`CURRENT_TIMESTAMP`,
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

  if (deletion.changes !== 1) {
    throw new Error("La fiche produit n’a pas pu être supprimée.");
  }

  logEvent({
    workspaceId: access.workspaceId,
    actorUserId: access.userId,
    action: "product.delete",
    entityType: "product",
    entityId: input.productId,
    metadata: {
      product_id: input.productId,
      previous_status: product.status,
      status: "deleted",
      deleted_file: false
    }
  });

  return {
    previousStatus: product.status,
    productId: input.productId,
    status: "deleted"
  };
}

export async function restoreDeletedProduct(productId: string): Promise<{
  productId: string;
  status: "restored";
}> {
  const access = await requireWorkspaceAccess(productDeleteRoles);
  const restoration = db
    .update(products)
    .set({
      deletedAt: null,
      deletedReason: null,
      updatedAt: sql`CURRENT_TIMESTAMP`
    })
    .where(
      and(
        eq(products.id, productId),
        eq(products.workspaceId, access.workspaceId),
        isNotNull(products.deletedAt)
      )
    )
    .run();

  if (restoration.changes !== 1) {
    throw new Error("Fiche supprimée introuvable pour ce workspace.");
  }

  logEvent({
    workspaceId: access.workspaceId,
    actorUserId: access.userId,
    action: "product.restore",
    entityType: "product",
    entityId: productId,
    metadata: {
      product_id: productId,
      status: "restored"
    }
  });

  return {
    productId,
    status: "restored"
  };
}
