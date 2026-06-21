import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";

import {
  imports,
  importRows,
  products
} from "../../../db/schema";
import { logEvent } from "@/server/audit/event-log";
import { runDeterministicProductAudit } from "@/server/audit/product-audit";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { db } from "@/server/db/client";
import {
  assertImportBatchConfirmation,
  buildProductBatchNavigation,
  planImportBatchAudit,
  type ImportBatchProduct,
  type ProductBatchNavigation
} from "@/server/products/import-batch-core";

const batchAuditRoles = ["owner", "admin", "editor"] as const;
const batchMutationRoles = ["owner", "admin"] as const;
const batchReadRoles = ["owner", "admin", "editor", "viewer"] as const;

function getImportForWorkspace(importId: string, workspaceId: string) {
  return db
    .select({
      id: imports.id,
      originalFilename: imports.originalFilename
    })
    .from(imports)
    .where(
      and(eq(imports.id, importId), eq(imports.workspaceId, workspaceId))
    )
    .limit(1)
    .get();
}

function getBatchProducts(
  importId: string,
  workspaceId: string
): ImportBatchProduct[] {
  return db
    .select({
      createdAt: products.createdAt,
      deletedAt: products.deletedAt,
      id: products.id,
      importId: products.importId,
      rowIndex: importRows.rowIndex,
      title: products.title,
      workspaceId: products.workspaceId
    })
    .from(products)
    .leftJoin(
      importRows,
      and(
        eq(products.importRowId, importRows.id),
        eq(importRows.workspaceId, workspaceId)
      )
    )
    .where(
      and(
        eq(products.importId, importId),
        eq(products.workspaceId, workspaceId)
      )
    )
    .all();
}

export async function auditImportedProductBatch(importId: string): Promise<{
  auditedProductCount: number;
  skippedDeletedCount: number;
}> {
  const access = await requireWorkspaceAccess(batchAuditRoles);
  const importRecord = getImportForWorkspace(importId, access.workspaceId);

  if (!importRecord) {
    throw new Error("Import introuvable pour ce workspace.");
  }

  const plan = planImportBatchAudit(
    getBatchProducts(importId, access.workspaceId),
    {
      importId,
      workspaceId: access.workspaceId
    }
  );

  for (const productId of plan.productIds) {
    await runDeterministicProductAudit(productId);
  }

  logEvent({
    workspaceId: access.workspaceId,
    actorUserId: access.userId,
    action: "import.products.audit",
    entityType: "import",
    entityId: importId,
    metadata: {
      import_id: importId,
      product_count: plan.productIds.length,
      skipped_product_count: plan.skippedDeletedCount,
      status: plan.productIds.length > 0 ? "audited" : "empty"
    }
  });

  return {
    auditedProductCount: plan.productIds.length,
    skippedDeletedCount: plan.skippedDeletedCount
  };
}

export async function softDeleteImportedProductBatch(input: {
  confirmation: string;
  importId: string;
}): Promise<{
  alreadyDeletedCount: number;
  deletedProductCount: number;
}> {
  const access = await requireWorkspaceAccess(batchMutationRoles);
  const importRecord = getImportForWorkspace(input.importId, access.workspaceId);

  if (!importRecord) {
    throw new Error("Import introuvable pour ce workspace.");
  }

  assertImportBatchConfirmation({
    confirmation: input.confirmation,
    originalFilename: importRecord.originalFilename
  });

  const batchProducts = getBatchProducts(input.importId, access.workspaceId);
  const alreadyDeletedCount = batchProducts.filter(
    (product) => product.deletedAt
  ).length;
  const deletion = db
    .update(products)
    .set({
      deletedAt: sql`CURRENT_TIMESTAMP`,
      deletedReason: "import_batch",
      updatedAt: sql`CURRENT_TIMESTAMP`
    })
    .where(
      and(
        eq(products.importId, input.importId),
        eq(products.workspaceId, access.workspaceId),
        isNull(products.deletedAt)
      )
    )
    .run();

  logEvent({
    workspaceId: access.workspaceId,
    actorUserId: access.userId,
    action: "import.products.delete",
    entityType: "import",
    entityId: input.importId,
    metadata: {
      import_id: input.importId,
      product_count: deletion.changes,
      skipped_product_count: alreadyDeletedCount,
      status: deletion.changes > 0 ? "deleted" : "unchanged"
    }
  });

  return {
    alreadyDeletedCount,
    deletedProductCount: deletion.changes
  };
}

export async function restoreImportedProductBatch(input: {
  confirmation: string;
  importId: string;
}): Promise<{
  activeProductCount: number;
  restoredProductCount: number;
}> {
  const access = await requireWorkspaceAccess(batchMutationRoles);
  const importRecord = getImportForWorkspace(input.importId, access.workspaceId);

  if (!importRecord) {
    throw new Error("Import introuvable pour ce workspace.");
  }

  assertImportBatchConfirmation({
    confirmation: input.confirmation,
    originalFilename: importRecord.originalFilename
  });

  const batchProducts = getBatchProducts(input.importId, access.workspaceId);
  const activeProductCount = batchProducts.filter(
    (product) => !product.deletedAt
  ).length;
  const restoration = db
    .update(products)
    .set({
      deletedAt: null,
      deletedReason: null,
      updatedAt: sql`CURRENT_TIMESTAMP`
    })
    .where(
      and(
        eq(products.importId, input.importId),
        eq(products.workspaceId, access.workspaceId),
        isNotNull(products.deletedAt)
      )
    )
    .run();

  logEvent({
    workspaceId: access.workspaceId,
    actorUserId: access.userId,
    action: "import.products.restore",
    entityType: "import",
    entityId: input.importId,
    metadata: {
      import_id: input.importId,
      product_count: restoration.changes,
      skipped_product_count: activeProductCount,
      status: restoration.changes > 0 ? "restored" : "unchanged"
    }
  });

  return {
    activeProductCount,
    restoredProductCount: restoration.changes
  };
}

export async function getProductBatchNavigation(
  productId: string
): Promise<ProductBatchNavigation | null> {
  const access = await requireWorkspaceAccess(batchReadRoles);
  const product = db
    .select({
      deletedAt: products.deletedAt,
      importId: products.importId
    })
    .from(products)
    .where(
      and(
        eq(products.id, productId),
        eq(products.workspaceId, access.workspaceId)
      )
    )
    .limit(1)
    .get();

  if (!product?.importId || product.deletedAt) {
    return null;
  }

  return buildProductBatchNavigation(
    getBatchProducts(product.importId, access.workspaceId),
    {
      currentProductId: productId,
      importId: product.importId,
      workspaceId: access.workspaceId
    }
  );
}
