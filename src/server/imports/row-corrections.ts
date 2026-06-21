import { and, eq, sql } from "drizzle-orm";

import { imports, importRows } from "../../../db/schema";
import { logEvent } from "@/server/audit/event-log";
import { db } from "@/server/db/client";
import {
  countCorrectedImportRowFields,
  createImportRowCorrectionLogMetadata,
  getEditableImportRowData
} from "@/server/imports/row-corrections-core";
import { getCsvImportWriteAccess } from "@/server/imports/service";
import { validateCsvRowData } from "@/server/imports/validation";
import type { ImportRowStatus, RawImportRow } from "@/types/import";

export type CorrectImportRowResult = {
  correctedFieldCount: number;
  newStatus: ImportRowStatus | "warning";
  previousStatus: ImportRowStatus | "warning";
  rowId: string;
};

function getDisplayRowStatus(input: {
  errorMessage: string | null;
  status: ImportRowStatus;
}): ImportRowStatus | "warning" {
  if (input.status === "ready" && input.errorMessage) {
    return "warning";
  }

  return input.status;
}

function getCorrectionValues(formData: FormData): RawImportRow {
  const values: RawImportRow = {};

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("rowValue.") || typeof value !== "string") {
      continue;
    }

    values[key.slice("rowValue.".length)] = value;
  }

  return values;
}

export async function correctImportRowFromForm(
  importId: string,
  rowId: string,
  formData: FormData
): Promise<CorrectImportRowResult> {
  const access = await getCsvImportWriteAccess();
  const importRecord = db
    .select({
      detectedColumns: imports.detectedColumns,
      id: imports.id,
      status: imports.status
    })
    .from(imports)
    .where(
      and(eq(imports.id, importId), eq(imports.workspaceId, access.workspaceId))
    )
    .limit(1)
    .get();

  if (!importRecord) {
    throw new Error("Import not found for this workspace.");
  }

  if (importRecord.status === "failed" || importRecord.status === "processed") {
    throw new Error("This import can no longer be corrected.");
  }

  const row = db
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
        eq(importRows.id, rowId),
        eq(importRows.importId, importId),
        eq(importRows.workspaceId, access.workspaceId)
      )
    )
    .limit(1)
    .get();

  if (!row) {
    throw new Error("Import row not found for this workspace.");
  }

  if (row.status === "imported") {
    throw new Error("Imported rows cannot be corrected.");
  }

  const correctionValues = getCorrectionValues(formData);
  const allowedColumns = new Set(importRecord.detectedColumns);
  const effectiveData = getEditableImportRowData({
    correctedData: row.correctedData,
    columns: importRecord.detectedColumns,
    rawData: row.rawData
  });
  let submittedAllowedFieldCount = 0;

  for (const [column, value] of Object.entries(correctionValues)) {
    if (!allowedColumns.has(column)) {
      continue;
    }

    effectiveData[column] = value;
    submittedAllowedFieldCount += 1;
  }

  if (submittedAllowedFieldCount === 0) {
    throw new Error("No editable CSV field was submitted.");
  }

  const previousStatus = getDisplayRowStatus(row);
  const validation = validateCsvRowData({
    columns: importRecord.detectedColumns,
    rawData: effectiveData,
    rowIndex: row.rowIndex
  });
  const newStatus = getDisplayRowStatus(validation);
  const correctedFieldCount = countCorrectedImportRowFields({
    columns: importRecord.detectedColumns,
    correctedData: validation.rawData,
    rawData: row.rawData
  });

  db.transaction((tx) => {
    tx.update(importRows)
      .set({
        correctedData: validation.rawData,
        errorMessage: validation.errorMessage,
        status: validation.status,
        updatedAt: sql`CURRENT_TIMESTAMP`
      })
      .where(
        and(
          eq(importRows.id, rowId),
          eq(importRows.importId, importId),
          eq(importRows.workspaceId, access.workspaceId)
        )
      )
      .run();

    tx.update(imports)
      .set({ updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(
        and(eq(imports.id, importId), eq(imports.workspaceId, access.workspaceId))
      )
      .run();
  });

  logEvent({
    workspaceId: access.workspaceId,
    actorUserId: access.userId,
    action: "import.row.correct",
    entityType: "import_row",
    entityId: rowId,
    metadata: createImportRowCorrectionLogMetadata({
      correctedFieldCount,
      importId,
      newStatus,
      previousStatus,
      rowId
    })
  });

  return {
    correctedFieldCount,
    newStatus,
    previousStatus,
    rowId
  };
}
