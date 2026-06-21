import { and, desc, eq, sql } from "drizzle-orm";

import { catalogExports, products, workspaces } from "../../../db/schema";
import { logEvent } from "@/server/audit/event-log";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { db } from "@/server/db/client";
import {
  assertFeatureAllowed,
  assertQuotaAvailable,
  getEntitlementSummary
} from "@/server/entitlements/service";
import { isFeatureAllowed } from "@/server/entitlements/core";
import { createServerId } from "@/server/ids";
import {
  createExportCode,
  createExportDataHash,
  createExportFilename,
  createExportIdentity,
  createSha256Hash,
  getExportScope
} from "@/server/exports/identity";
import {
  createExportLogMetadata,
  renderCsvExport,
  renderTextExport,
  resolveExportProductSelection,
  type ValidatedExportProduct
} from "@/server/exports/core";
import { renderPdfExport } from "@/server/exports/pdf";
import {
  deleteExportFile,
  getExportStorageKey,
  readExportFile,
  saveExportFile
} from "@/server/exports/storage";
import {
  markStorageObjectDeleted,
  recordStorageObject
} from "@/server/storage/manifest";
import type { WorkspaceAccess } from "@/types/auth";
import type {
  ExportIdentity,
  CatalogExportSummary,
  CatalogExportType,
  ValidatedCatalogExportProduct
} from "@/types/export";
import type { FeatureKey } from "@/types/entitlement";

const exportReadRoles = ["owner", "admin", "editor", "viewer"] as const;
const exportWriteRoles = ["owner", "admin", "editor"] as const;
const exportFeatureByType: Record<CatalogExportType, FeatureKey> = {
  csv: "export_csv",
  pdf: "export_pdf",
  text: "export_txt"
};

type CreateCatalogExportResult = {
  exportCode: string;
  exportId: string;
  exportType: CatalogExportType;
  productCount: number;
  selectedProductCount: number | null;
  skippedProductCount: number;
};

type DeleteCatalogExportResult = {
  deletedFile: boolean;
  exportId: string;
  exportType: CatalogExportType;
  status: "deleted";
};

type ExportFile = {
  content: string | Buffer;
};

export type CatalogExportsPageData = {
  canExportCsv: boolean;
  canExportPdf: boolean;
  canExportText: boolean;
  exports: CatalogExportSummary[];
  exportLimitReached: boolean;
  skippedProductCount: number;
  validatedProducts: ValidatedCatalogExportProduct[];
  validatedProductCount: number;
};

export type CatalogExportDownload = {
  content: Buffer;
  contentType: string;
  filename: string;
};

async function getExportReadAccess(): Promise<WorkspaceAccess> {
  return requireWorkspaceAccess(exportReadRoles);
}

async function getExportWriteAccess(): Promise<WorkspaceAccess> {
  return requireWorkspaceAccess(exportWriteRoles);
}

function getExportContent(
  exportProducts: ValidatedExportProduct[],
  exportType: CatalogExportType,
  identity: ExportIdentity
): ExportFile {
  if (exportType === "text") {
    return {
      content: renderTextExport(exportProducts, identity)
    };
  }

  if (exportType === "csv") {
    return {
      content: renderCsvExport(exportProducts)
    };
  }

  return {
    content: renderPdfExport(exportProducts, identity)
  };
}

function createUniqueExportCode(): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const exportCode = createExportCode();
    const existing = db
      .select({ id: catalogExports.id })
      .from(catalogExports)
      .where(eq(catalogExports.exportCode, exportCode))
      .limit(1)
      .get();

    if (!existing) {
      return exportCode;
    }
  }

  throw new Error("Impossible de générer un code d’export unique.");
}

function getExportDownloadMetadata(exportType: CatalogExportType): {
  contentType: string;
  extension: "txt" | "csv" | "pdf";
} {
  if (exportType === "text") {
    return {
      contentType: "text/plain",
      extension: "txt"
    };
  }

  if (exportType === "csv") {
    return {
      contentType: "text/csv",
      extension: "csv"
    };
  }

  return {
    contentType: "application/pdf",
    extension: "pdf"
  };
}

function getValidatedExportProducts(
  access: WorkspaceAccess,
  productIds?: string[]
): {
  exportProducts: ValidatedExportProduct[];
  selectedProductCount: number | null;
  skippedProductCount: number;
  validatedProducts: ValidatedCatalogExportProduct[];
} {
  const workspaceProducts = db
    .select({
      id: products.id,
      category: products.category,
      deletedAt: products.deletedAt,
      sku: products.sku,
      status: products.status,
      title: products.title,
      validatedData: products.validatedData
    })
    .from(products)
    .where(eq(products.workspaceId, access.workspaceId))
    .all();

  return resolveExportProductSelection(workspaceProducts, productIds);
}

function logExportEvent(input: {
  access: WorkspaceAccess;
  exportId: string;
  exportType: CatalogExportType;
  productCount: number;
  selectedProductCount: number | null;
  skippedProductCount: number;
  status: "complete" | "failed";
}): void {
  logEvent({
    workspaceId: input.access.workspaceId,
    actorUserId: input.access.userId,
    action: "catalog.export",
    entityType: "export",
    entityId: input.exportId,
    metadata: createExportLogMetadata(input)
  });
}

function logExportDeletionEvent(input: {
  access: WorkspaceAccess;
  deletedFile: boolean;
  exportId: string;
  exportType: CatalogExportType;
}): void {
  logEvent({
    workspaceId: input.access.workspaceId,
    actorUserId: input.access.userId,
    action: "catalog.export.delete",
    entityType: "export",
    entityId: input.exportId,
    metadata: {
      export_id: input.exportId,
      export_type: input.exportType,
      status: "deleted",
      deleted_file: input.deletedFile
    }
  });
}

export async function getCatalogExportsPageData(): Promise<CatalogExportsPageData> {
  const access = await getExportReadAccess();
  const { skippedProductCount, validatedProducts } =
    getValidatedExportProducts(access);
  const entitlement = getEntitlementSummary(access.workspaceId);
  const exports = db
    .select({
      dataHash: catalogExports.dataHash,
      exportCode: catalogExports.exportCode,
      exportScope: catalogExports.exportScope,
      id: catalogExports.id,
      exportType: catalogExports.exportType,
      filename: catalogExports.filename,
      fileHash: catalogExports.fileHash,
      status: catalogExports.status,
      productCount: catalogExports.productCount,
      storagePath: catalogExports.storagePath,
      createdAt: catalogExports.createdAt,
      deletedAt: catalogExports.deletedAt
    })
    .from(catalogExports)
    .where(eq(catalogExports.workspaceId, access.workspaceId))
    .orderBy(desc(catalogExports.createdAt))
    .all();

  return {
    canExportCsv: isFeatureAllowed(
      entitlement.entitlement.effectivePlanKey,
      "export_csv"
    ),
    canExportPdf: isFeatureAllowed(
      entitlement.entitlement.effectivePlanKey,
      "export_pdf"
    ),
    canExportText: isFeatureAllowed(
      entitlement.entitlement.effectivePlanKey,
      "export_txt"
    ),
    exports,
    exportLimitReached:
      entitlement.usage.maxExports >= entitlement.plan.quotas.maxExports,
    skippedProductCount,
    validatedProducts,
    validatedProductCount: validatedProducts.length
  };
}

export async function createCatalogExport(
  exportType: CatalogExportType,
  productIds?: string[]
): Promise<CreateCatalogExportResult> {
  const access = await getExportWriteAccess();
  assertFeatureAllowed(access.workspaceId, exportFeatureByType[exportType]);
  assertFeatureAllowed(access.workspaceId, "secure_export_identity");
  assertQuotaAvailable(access.workspaceId, "maxExports");
  const { exportProducts, selectedProductCount, skippedProductCount } =
    getValidatedExportProducts(access, productIds);

  if (exportProducts.length === 0) {
    throw new Error("Aucun produit valid\u00e9 \u00e0 exporter.");
  }

  const exportId = createServerId("exp");
  const exportCode = createUniqueExportCode();
  const generatedAt = new Date().toISOString();
  const dataHash = createExportDataHash(exportProducts);
  const exportScope = getExportScope(productIds);
  const extension = getExportDownloadMetadata(exportType).extension;
  const filename = createExportFilename(exportCode, extension);
  const workspace = db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, access.workspaceId))
    .limit(1)
    .get();
  const identity = createExportIdentity({
    dataHash,
    exportCode,
    exportScope,
    exportType,
    generatedAt,
    productCount: exportProducts.length,
    workspaceName: workspace?.name ?? "Workspace Fichr"
  });

  db.insert(catalogExports)
    .values({
      createdAt: generatedAt,
      dataHash,
      exportCode,
      exportScope,
      id: exportId,
      workspaceId: access.workspaceId,
      createdBy: access.userId,
      exportType,
      filename,
      productIdsSnapshot: exportProducts.map((product) => product.id).sort(),
      status: "pending",
      productCount: exportProducts.length
    })
    .run();

  try {
    const exportFile = getExportContent(exportProducts, exportType, identity);
    const fileContent =
      typeof exportFile.content === "string"
        ? Buffer.from(exportFile.content, "utf8")
        : exportFile.content;
    const fileHash = createSha256Hash(fileContent);
    const storedExport = await saveExportFile({
      content: exportFile.content,
      filename,
      workspaceId: access.workspaceId
    });
    try {
      recordStorageObject({
        filename,
        hashSha256: fileHash,
        mimeType: storedExport.mimeType,
        objectType: "export_file",
        sizeBytes: storedExport.sizeBytes,
        storageKey: storedExport.storageKey,
        workspaceId: access.workspaceId
      });
    } catch (error) {
      await deleteExportFile(storedExport.storageKey, access.workspaceId);
      throw error;
    }

    db.update(catalogExports)
      .set({
        fileHash,
        status: "complete",
        storagePath: storedExport.storageKey,
        updatedAt: sql`CURRENT_TIMESTAMP`
      })
      .where(
        and(
          eq(catalogExports.id, exportId),
          eq(catalogExports.workspaceId, access.workspaceId)
        )
      )
      .run();

    logExportEvent({
      access,
      exportId,
      exportType,
      productCount: exportProducts.length,
      selectedProductCount,
      skippedProductCount,
      status: "complete"
    });
  } catch (error) {
    db.update(catalogExports)
      .set({
        status: "failed",
        updatedAt: sql`CURRENT_TIMESTAMP`
      })
      .where(
        and(
          eq(catalogExports.id, exportId),
          eq(catalogExports.workspaceId, access.workspaceId)
        )
      )
      .run();

    logExportEvent({
      access,
      exportId,
      exportType,
      productCount: exportProducts.length,
      selectedProductCount,
      skippedProductCount,
      status: "failed"
    });

    throw error;
  }

  return {
    exportCode,
    exportId,
    exportType,
    productCount: exportProducts.length,
    selectedProductCount,
    skippedProductCount
  };
}

export async function deleteCatalogExport(
  exportId: string
): Promise<DeleteCatalogExportResult> {
  const access = await getExportWriteAccess();
  const exportRecord = db
    .select()
    .from(catalogExports)
    .where(
      and(
        eq(catalogExports.id, exportId),
        eq(catalogExports.workspaceId, access.workspaceId)
      )
    )
    .limit(1)
    .get();

  if (!exportRecord) {
    throw new Error("Export not found for this workspace.");
  }

  if (exportRecord.status === "deleted" || exportRecord.deletedAt) {
    return {
      deletedFile: false,
      exportId,
      exportType: exportRecord.exportType,
      status: "deleted"
    };
  }

  const deletedFile = exportRecord.storagePath
    ? await deleteExportFile(exportRecord.storagePath, access.workspaceId)
    : false;
  const storageKey = exportRecord.storagePath
    ? getExportStorageKey(exportRecord.storagePath, access.workspaceId)
    : null;

  if (storageKey) {
    markStorageObjectDeleted({
      storageKey,
      workspaceId: access.workspaceId
    });
  }

  db.update(catalogExports)
    .set({
      deletedAt: sql`CURRENT_TIMESTAMP`,
      status: "deleted",
      updatedAt: sql`CURRENT_TIMESTAMP`
    })
    .where(
      and(
        eq(catalogExports.id, exportId),
        eq(catalogExports.workspaceId, access.workspaceId)
      )
    )
    .run();

  logExportDeletionEvent({
    access,
    deletedFile,
    exportId,
    exportType: exportRecord.exportType
  });

  return {
    deletedFile,
    exportId,
    exportType: exportRecord.exportType,
    status: "deleted"
  };
}

export async function getCatalogExportDownload(
  exportId: string
): Promise<CatalogExportDownload> {
  const access = await getExportReadAccess();
  const exportRecord = db
    .select()
    .from(catalogExports)
    .where(
      and(
        eq(catalogExports.id, exportId),
        eq(catalogExports.workspaceId, access.workspaceId),
        eq(catalogExports.status, "complete")
      )
    )
    .limit(1)
    .get();

  if (!exportRecord?.storagePath || exportRecord.deletedAt) {
    throw new Error("Export not found for this workspace.");
  }

  const content = await readExportFile(
    exportRecord.storagePath,
    access.workspaceId
  );
  const metadata = getExportDownloadMetadata(exportRecord.exportType);

  return {
    content,
    contentType: metadata.contentType,
    filename:
      exportRecord.filename ??
      `fichr-export-${exportRecord.id}.${metadata.extension}`
  };
}
