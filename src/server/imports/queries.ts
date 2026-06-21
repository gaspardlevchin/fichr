import { asc, and, desc, eq, inArray } from "drizzle-orm";

import { imports, importRows, products, spaces } from "../../../db/schema";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { db } from "@/server/db/client";
import { getWorkspaceEntitlements, getWorkspaceUsage } from "@/server/entitlements/service";
import { IMPORT_PREVIEW_ROW_LIMIT } from "@/server/imports/csv-parser";
import { buildImportCreationPreflight } from "@/server/imports/creation-core";
import { getCompatibleCsvMappingPreset } from "@/server/imports/mapping-presets";
import { getEffectiveImportRowData } from "@/server/imports/row-corrections-core";
import { buildImportSpaceAssignmentReview } from "@/server/imports/space-review-core";
import type {
  ImportSpaceAssignmentReview,
  ImportCreationPreflight,
  ImportPreview,
  ImportValidationFilter,
  ImportValidationRow,
  ImportValidationRowStatus,
  ImportRowIssue,
  ImportIssueSummary,
  ImportSummary,
  ImportValidationSummary
} from "@/types/import";

export async function getCsvImportReadAccess() {
  return requireWorkspaceAccess([
    "owner",
    "admin",
    "editor",
    "viewer"
  ]);
}

function getRowDisplayStatus(input: {
  errorMessage: string | null;
  status: string;
}): ImportValidationRowStatus {
  if (input.status === "error") {
    return "error";
  }

  if (input.status === "skipped") {
    return "skipped";
  }

  return input.errorMessage ? "warning" : "ready";
}

function getImportValidationSummary(
  input: ImportValidationRow[]
): ImportValidationSummary {
  return {
    invalidRows: input.filter((row) => row.status === "error").length,
    readyRows: input.filter((row) => row.status === "ready").length,
    skippedRows: input.filter((row) => row.status === "skipped").length,
    totalRows: input.length,
    warningRows: input.filter((row) => row.status === "warning").length
  };
}

function getImportRowIssues(input: ImportValidationRow[]): ImportRowIssue[] {
  return input
    .filter((row) => row.errorMessage)
    .slice(0, 8)
    .map((row) => ({
      errorMessage: row.errorMessage ?? "",
      rowIndex: row.rowIndex,
      status: row.status
    }));
}

function getImportIssueSummary(
  input: ImportValidationRow[]
): ImportIssueSummary[] {
  const counts = new Map<string, number>();

  for (const row of input) {
    if (!row.errorMessage) {
      continue;
    }

    counts.set(row.errorMessage, (counts.get(row.errorMessage) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([message, count]) => ({ count, message }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 4);
}

function filterImportValidationRows(
  rows: ImportValidationRow[],
  filter: ImportValidationFilter = "all"
): ImportValidationRow[] {
  return filter === "all" ? rows : rows.filter((row) => row.status === filter);
}

export async function getImportPreview(
  importId: string,
  rowStatusFilter: ImportValidationFilter = "all"
): Promise<ImportPreview | null> {
  const access = await getCsvImportReadAccess();
  const importRecord = db
    .select()
    .from(imports)
    .where(
      and(eq(imports.id, importId), eq(imports.workspaceId, access.workspaceId))
    )
    .limit(1)
    .get();

  if (!importRecord) {
    return null;
  }

  const rows = db
    .select({
      correctedData: importRows.correctedData,
      rawData: importRows.rawData
    })
    .from(importRows)
    .where(
      and(
        eq(importRows.importId, importRecord.id),
        eq(importRows.workspaceId, access.workspaceId)
      )
    )
    .orderBy(asc(importRows.rowIndex))
    .limit(IMPORT_PREVIEW_ROW_LIMIT)
    .all()
    .map((row) => getEffectiveImportRowData(row));
  const rowValidation = db
    .select({
      correctedData: importRows.correctedData,
      errorMessage: importRows.errorMessage,
      id: importRows.id,
      rawData: importRows.rawData,
      rowIndex: importRows.rowIndex,
      status: importRows.status
    })
    .from(importRows)
    .where(
      and(
        eq(importRows.importId, importRecord.id),
        eq(importRows.workspaceId, access.workspaceId)
      )
    )
    .orderBy(asc(importRows.rowIndex))
    .all()
    .map((row) => {
      const effectiveRawData = getEffectiveImportRowData(row);

      return {
        correctedData: row.correctedData,
        errorMessage: row.errorMessage,
        hasCorrections: Boolean(row.correctedData),
        id: row.id,
        rawData: effectiveRawData,
        rowIndex: row.rowIndex,
        status: getRowDisplayStatus(row)
      };
    });

  return {
    id: importRecord.id,
    originalFilename: importRecord.originalFilename,
    status: importRecord.status,
    sourceType: importRecord.sourceType,
    rowCount: importRecord.rowCount,
    detectedColumns: importRecord.detectedColumns,
    columnMapping: importRecord.columnMapping,
    errorMessage: importRecord.errorMessage,
    mappingPresetSuggestion: importRecord.columnMapping
      ? null
      : getCompatibleCsvMappingPreset(
          access.workspaceId,
          importRecord.detectedColumns
        ),
    issueSummary: getImportIssueSummary(rowValidation),
    rowIssues: getImportRowIssues(rowValidation),
    rows,
    validationRows: filterImportValidationRows(rowValidation, rowStatusFilter),
    validationSummary: getImportValidationSummary(rowValidation)
  };
}

export async function getImportCreationPreflight(
  importId: string
): Promise<ImportCreationPreflight | null> {
  const access = await getCsvImportReadAccess();
  const importRecord = db
    .select({
      columnMapping: imports.columnMapping,
      status: imports.status
    })
    .from(imports)
    .where(
      and(eq(imports.id, importId), eq(imports.workspaceId, access.workspaceId))
    )
    .limit(1)
    .get();

  if (!importRecord) {
    return null;
  }

  const sourceRows = db
    .select({
      correctedData: importRows.correctedData,
      id: importRows.id,
      rawData: importRows.rawData,
      rowIndex: importRows.rowIndex
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
  const blockedRowCount = db
    .select({ id: importRows.id })
    .from(importRows)
    .where(
      and(
        eq(importRows.importId, importId),
        eq(importRows.workspaceId, access.workspaceId),
        inArray(importRows.status, ["error", "skipped"])
      )
    )
    .all().length;
  const importedRowCount = db
    .select({ id: importRows.id })
    .from(importRows)
    .where(
      and(
        eq(importRows.importId, importId),
        eq(importRows.workspaceId, access.workspaceId),
        eq(importRows.status, "imported")
      )
    )
    .all().length;
  const existingProductRowIds =
    sourceRows.length > 0
      ? db
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
      : [];
  const workspaceSpaces = db
    .select({
      archivedAt: spaces.deletedAt,
      name: spaces.name
    })
    .from(spaces)
    .where(eq(spaces.workspaceId, access.workspaceId))
    .all();
  const entitlement = getWorkspaceEntitlements(access.workspaceId);
  const usage = getWorkspaceUsage(access.workspaceId);

  return buildImportCreationPreflight({
    blockedRowCount,
    canWrite: ["owner", "admin", "editor"].includes(access.role),
    existingProductRowIds,
    importedRowCount,
    importStatus: importRecord.status,
    mapping: importRecord.columnMapping,
    planKey: entitlement.effectivePlanKey,
    rows: sourceRows,
    spaces: workspaceSpaces,
    usage: {
      products: usage.maxProducts,
      spaces: usage.maxSpaces
    }
  });
}

export async function getRecentImports(): Promise<ImportSummary[]> {
  const access = await getCsvImportReadAccess();

  return db
    .select({
      id: imports.id,
      originalFilename: imports.originalFilename,
      status: imports.status,
      rowCount: imports.rowCount,
      createdAt: imports.createdAt
    })
    .from(imports)
    .where(eq(imports.workspaceId, access.workspaceId))
    .orderBy(desc(imports.createdAt))
    .limit(12)
    .all();
}

export async function getImportSpaceAssignmentReview(
  importId: string
): Promise<ImportSpaceAssignmentReview | null> {
  const access = await getCsvImportReadAccess();
  const importRecord = db
    .select({ columnMapping: imports.columnMapping })
    .from(imports)
    .where(
      and(eq(imports.id, importId), eq(imports.workspaceId, access.workspaceId))
    )
    .limit(1)
    .get();

  if (!importRecord) {
    return null;
  }

  const rows = db
    .select({
      correctedData: importRows.correctedData,
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
    .all()
    .map((row) => getEffectiveImportRowData(row));
  const workspaceSpaces = db
    .select({
      archivedAt: spaces.deletedAt,
      name: spaces.name
    })
    .from(spaces)
    .where(eq(spaces.workspaceId, access.workspaceId))
    .all();

  return buildImportSpaceAssignmentReview({
    mapping: importRecord.columnMapping,
    rows,
    spaces: workspaceSpaces
  });
}
