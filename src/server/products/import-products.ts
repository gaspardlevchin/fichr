import { and, eq, inArray, sql } from "drizzle-orm";

import { imports, importRows, products, spaces } from "../../../db/schema";
import { logEvent } from "@/server/audit/event-log";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { db } from "@/server/db/client";
import {
  assertFeatureAllowed,
  EntitlementError,
  getWorkspaceUsage
} from "@/server/entitlements/service";
import { createServerId } from "@/server/ids";
import {
  buildImportCreationSpacePlan,
  assertImportCreationQuotas,
  buildImportDraftCreationPlan
} from "@/server/imports/creation-core";
import {
  ImportDraftCreationError,
  ImportEntitlementError,
  ImportFlowError,
  ImportMappingIncompleteError,
  ImportWorkspaceForbiddenError
} from "@/server/imports/errors";
import type { ProductFieldKey } from "@/types/import";
import type { ProductDraftData } from "@/types/product";

const productWriteRoles = ["owner", "admin", "editor"] as const;

export type CreateDraftProductsResult = {
  importId: string;
  createdProductCount: number;
  skippedRowCount: number;
  status: "processed";
};

function getStringField(
  draftData: ProductDraftData,
  field: ProductFieldKey
): string | null {
  const value = draftData[field];
  return typeof value === "string" ? value : null;
}

function getNumberField(
  draftData: ProductDraftData,
  field: ProductFieldKey
): number | null {
  const value = draftData[field];
  return typeof value === "number" ? value : null;
}

function assertImportFeatureAllowed(
  workspaceId: string,
  featureKey: "create_product" | "create_space"
) {
  try {
    return assertFeatureAllowed(workspaceId, featureKey);
  } catch (error) {
    if (error instanceof EntitlementError) {
      throw new ImportEntitlementError(error.message);
    }

    throw error;
  }
}

export async function createDraftProductsFromImport(
  importId: string
): Promise<CreateDraftProductsResult> {
  const access = await requireWorkspaceAccess(productWriteRoles);
  const importRecord = db
    .select({
      id: imports.id,
      status: imports.status,
      columnMapping: imports.columnMapping
    })
    .from(imports)
    .where(and(eq(imports.id, importId), eq(imports.workspaceId, access.workspaceId)))
    .limit(1)
    .get();

  if (!importRecord) {
    throw new ImportWorkspaceForbiddenError();
  }

  if (importRecord.status !== "mapped" && importRecord.status !== "processed") {
    throw new ImportMappingIncompleteError(
      "Validez le mapping avant de créer les produits brouillons."
    );
  }

  const columnMapping = importRecord.columnMapping;

  if (!columnMapping) {
    throw new ImportMappingIncompleteError(
      "Le mapping de cet import est manquant. Associez les colonnes avant de continuer."
    );
  }

  const sourceRows = db
    .select({
      correctedData: importRows.correctedData,
      id: importRows.id,
      rowIndex: importRows.rowIndex,
      rawData: importRows.rawData
    })
    .from(importRows)
    .where(
      and(
        eq(importRows.importId, importId),
        eq(importRows.workspaceId, access.workspaceId),
        inArray(importRows.status, ["ready", "pending"])
      )
    )
    .all();
  const blockedRows = db
    .select({ id: importRows.id })
    .from(importRows)
    .where(
      and(
        eq(importRows.importId, importId),
        eq(importRows.workspaceId, access.workspaceId),
        inArray(importRows.status, ["error", "skipped"])
      )
    )
    .all();
  const importedRows = db
    .select({ id: importRows.id })
    .from(importRows)
    .where(
      and(
        eq(importRows.importId, importId),
        eq(importRows.workspaceId, access.workspaceId),
        eq(importRows.status, "imported")
      )
    )
    .all();

  const existingProductRows =
    sourceRows.length > 0
      ? new Set(
          db
            .select({ importRowId: products.importRowId })
            .from(products)
            .where(
              and(
                eq(products.workspaceId, access.workspaceId),
                inArray(
                  products.importRowId,
                  sourceRows.map((row) => row.id)
                )
              )
            )
            .all()
            .flatMap((product) =>
              product.importRowId ? [product.importRowId] : []
            )
        )
      : new Set<string>();
  const creationPlan = buildImportDraftCreationPlan({
    mapping: columnMapping,
    rows: sourceRows.filter((row) => !existingProductRows.has(row.id))
  });

  if (
    importRecord.status === "processed" &&
    sourceRows.length === 0 &&
    importedRows.length > 0
  ) {
    return {
      importId,
      createdProductCount: 0,
      skippedRowCount: blockedRows.length + importedRows.length,
      status: "processed"
    };
  }

  const workspaceSpaces = db
    .select({
      archivedAt: spaces.deletedAt,
      name: spaces.name
    })
    .from(spaces)
    .where(eq(spaces.workspaceId, access.workspaceId))
    .all();
  const spacePlan = buildImportCreationSpacePlan({
    candidates: creationPlan.candidates,
    spaces: workspaceSpaces
  });
  const newSpaceCount = spacePlan.newSpaceNames.length;
  const entitlement = assertImportFeatureAllowed(
    access.workspaceId,
    "create_product"
  );

  if (newSpaceCount > 0) {
    assertImportFeatureAllowed(access.workspaceId, "create_space");
  }

  const usage = getWorkspaceUsage(access.workspaceId);
  assertImportCreationQuotas({
    currentProductCount: usage.maxProducts,
    currentSpaceCount: usage.maxSpaces,
    newSpaceCount,
    planKey: entitlement.effectivePlanKey,
    productCount: creationPlan.candidates.length
  });

  let createdProductCount = 0;
  let skippedRowCount =
    blockedRows.length +
    existingProductRows.size +
    creationPlan.skippedRowIds.length;

  try {
    db.transaction((tx) => {
      for (const rowId of creationPlan.skippedRowIds) {
        tx.update(importRows)
          .set({
            errorMessage: "Aucune donnee mappee exploitable pour cette ligne.",
            status: "skipped",
            updatedAt: sql`CURRENT_TIMESTAMP`
          })
          .where(
            and(
              eq(importRows.id, rowId),
              eq(importRows.workspaceId, access.workspaceId)
            )
          )
          .run();
      }

      for (const candidate of creationPlan.candidates) {
        const existingProduct = tx
          .select({ id: products.id })
          .from(products)
          .where(
            and(
              eq(products.workspaceId, access.workspaceId),
              eq(products.importRowId, candidate.rowId)
            )
          )
          .limit(1)
          .get();

        if (existingProduct) {
          skippedRowCount += 1;
          continue;
        }

        let spaceId: string | null = null;

        if (candidate.mappedSpaceName) {
          const existingSpace = tx
            .select({
              archivedAt: spaces.deletedAt,
              id: spaces.id
            })
            .from(spaces)
            .where(
              and(
                eq(spaces.workspaceId, access.workspaceId),
                eq(spaces.name, candidate.mappedSpaceName)
              )
            )
            .limit(1)
            .get();

          if (existingSpace && !existingSpace.archivedAt) {
            spaceId = existingSpace.id;
          } else if (!existingSpace) {
            spaceId = createServerId("spc");
            tx.insert(spaces)
              .values({
                id: spaceId,
                name: candidate.mappedSpaceName,
                workspaceId: access.workspaceId
              })
              .run();
          }
        }

        tx.insert(products)
          .values({
            id: createServerId("prd"),
            workspaceId: access.workspaceId,
            importId,
            importRowId: candidate.rowId,
            spaceId,
            status: candidate.status,
            title: candidate.title,
            subtitle: getStringField(candidate.draftData, "subtitle"),
            category: getStringField(candidate.draftData, "category"),
            description: getStringField(candidate.draftData, "description"),
            materials: getStringField(candidate.draftData, "materials"),
            dimensions: getStringField(candidate.draftData, "dimensions"),
            origin: getStringField(candidate.draftData, "origin"),
            currentPrice: getNumberField(
              candidate.draftData,
              "current_price"
            ),
            desiredPrice: getNumberField(
              candidate.draftData,
              "desired_price"
            ),
            costPrice: getNumberField(candidate.draftData, "cost_price"),
            targetMargin: getNumberField(
              candidate.draftData,
              "target_margin"
            ),
            sku: getStringField(candidate.draftData, "sku"),
            imageUrl: getStringField(candidate.draftData, "image_url"),
            clientNotes: getStringField(candidate.draftData, "client_notes"),
            draftData: candidate.draftData,
            rawData: candidate.rowData
          })
          .run();

        tx.update(importRows)
          .set({
            status: "imported",
            updatedAt: sql`CURRENT_TIMESTAMP`
          })
          .where(
            and(
              eq(importRows.id, candidate.rowId),
              eq(importRows.workspaceId, access.workspaceId)
            )
          )
          .run();

        createdProductCount += 1;
      }

      tx.update(imports)
        .set({
          status: "processed",
          updatedAt: sql`CURRENT_TIMESTAMP`
        })
        .where(
          and(
            eq(imports.id, importId),
            eq(imports.workspaceId, access.workspaceId)
          )
        )
        .run();
    });
  } catch (error) {
    if (error instanceof ImportFlowError) {
      throw error;
    }

    throw new ImportDraftCreationError();
  }

  logEvent({
    workspaceId: access.workspaceId,
    actorUserId: access.userId,
    action: "import.products.create",
    entityType: "import",
    entityId: importId,
    metadata: {
      import_id: importId,
      created_product_count: createdProductCount,
      skipped_row_count: skippedRowCount,
      status: "processed"
    }
  });

  return {
    importId,
    createdProductCount,
    skippedRowCount,
    status: "processed"
  };
}
