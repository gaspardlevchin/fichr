import { createHash } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import { imports, importRows, storageObjects } from "../../../db/schema";
import { logEvent } from "@/server/audit/event-log";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { db } from "@/server/db/client";
import {
  assertFeatureAllowed,
  EntitlementError,
  getWorkspaceUsage
} from "@/server/entitlements/service";
import { createServerId } from "@/server/ids";
import { MAX_CSV_IMPORT_BYTES } from "@/server/imports/csv-parser";
import { assertCsvImportQuota } from "@/server/imports/creation-core";
import {
  CsvImportValidationError,
  ImportEntitlementError,
  ImportStorageError
} from "@/server/imports/errors";
import {
  deleteOriginalCsvFile,
  saveOriginalCsvFile
} from "@/server/imports/storage";
import { recordStorageObject } from "@/server/storage/manifest";
import {
  assertCsvImportCanProceed,
  validateCsvImport,
  type CsvImportValidationSummary
} from "@/server/imports/validation";
import type { WorkspaceAccess } from "@/types/auth";
import type { ImportStatus } from "@/types/import";

const allowedCsvMimeTypes = new Set([
  "",
  "application/csv",
  "application/octet-stream",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain"
]);

export async function getCsvImportWriteAccess(): Promise<WorkspaceAccess> {
  return requireWorkspaceAccess(["owner", "admin", "editor"]);
}

function assertCsvFile(file: File): void {
  const filename = file.name.toLowerCase();

  if (!filename.endsWith(".csv")) {
    throw new CsvImportValidationError(
      "Seuls les fichiers avec l’extension .csv sont acceptés."
    );
  }

  if (!allowedCsvMimeTypes.has(file.type)) {
    throw new CsvImportValidationError(
      "Le fichier sélectionné n’est pas reconnu comme un CSV."
    );
  }

  if (file.size <= 0) {
    throw new CsvImportValidationError(
      "Le fichier CSV sélectionné est vide."
    );
  }

  if (file.size > MAX_CSV_IMPORT_BYTES) {
    throw new CsvImportValidationError(
      "Les fichiers CSV sont limités à 2 Mo."
    );
  }
}

function logImportEvent(
  access: WorkspaceAccess,
  importId: string,
  summary: CsvImportValidationSummary,
  status: ImportStatus
): void {
  logEvent({
    workspaceId: access.workspaceId,
    actorUserId: access.userId,
    action: "import.csv",
    entityType: "import",
    entityId: importId,
    metadata: {
      import_id: importId,
      invalid_rows: summary.invalidRows,
      row_count: summary.totalRows,
      source_type: "csv",
      status,
      total_rows: summary.totalRows,
      valid_rows: summary.readyRows,
      warning_rows: summary.warningRows
    }
  });
}

function getImportValidationMessage(input: {
  columnIssues: Array<{ message: string }>;
  summary: CsvImportValidationSummary;
}): string | null {
  const messages = input.columnIssues.map((issue) => issue.message);

  if (input.summary.readyRows === 0 && input.summary.totalRows > 0) {
    messages.push("Aucune ligne n’est prête à être transformée en fiche.");
  }

  return messages.length > 0 ? messages.join(" ") : null;
}

function hasSimilarCsvImport(workspaceId: string, hashSha256: string): boolean {
  return Boolean(
    db
      .select({ id: storageObjects.id })
      .from(storageObjects)
      .where(
        and(
          eq(storageObjects.workspaceId, workspaceId),
          eq(storageObjects.objectType, "import_source"),
          eq(storageObjects.hashSha256, hashSha256),
          isNull(storageObjects.deletedAt)
        )
      )
      .limit(1)
      .get()
  );
}

export async function createCsvImport(file: File): Promise<string> {
  assertCsvFile(file);

  const access = await getCsvImportWriteAccess();
  let entitlement;

  try {
    entitlement = assertFeatureAllowed(access.workspaceId, "import_csv");
  } catch (error) {
    if (error instanceof EntitlementError) {
      throw new ImportEntitlementError(error.message);
    }

    throw error;
  }

  assertCsvImportQuota({
    currentImportCount: getWorkspaceUsage(access.workspaceId).maxImports,
    planKey: entitlement.effectivePlanKey
  });
  const importId = createServerId("imp");
  const content = Buffer.from(await file.arrayBuffer());
  const contentHash = createHash("sha256").update(content).digest("hex");
  const similarImportExists = hasSimilarCsvImport(
    access.workspaceId,
    contentHash
  );
  let storedImport;

  try {
    storedImport = await saveOriginalCsvFile({
      workspaceId: access.workspaceId,
      importId,
      filename: file.name,
      content
    });
  } catch {
    throw new ImportStorageError();
  }
  const storedFilename = storedImport.storageKey.split("/").at(-1);

  if (!storedFilename) {
    throw new ImportStorageError();
  }

  try {
    recordStorageObject({
      filename: storedFilename,
      hashSha256: storedImport.hashSha256,
      mimeType: storedImport.mimeType,
      objectType: "import_source",
      sizeBytes: storedImport.sizeBytes,
      storageKey: storedImport.storageKey,
      workspaceId: access.workspaceId
    });
  } catch {
    try {
      await deleteOriginalCsvFile({
        storageKey: storedImport.storageKey,
        workspaceId: access.workspaceId
      });
    } catch {
      // The user-facing error must not expose storage paths.
    }

    throw new ImportStorageError(
      "Le fichier CSV a été enregistré, mais son suivi local a échoué. Aucun import exploitable n’a été créé."
    );
  }

  try {
    const decodedCsv = new TextDecoder("utf-8", { fatal: true }).decode(
      content
    );
    const validation = validateCsvImport(decodedCsv);

    try {
      assertCsvImportCanProceed(validation);
    } catch (error) {
      throw new CsvImportValidationError(
        error instanceof Error
          ? error.message
          : "Le contenu du CSV n’est pas exploitable."
      );
    }

    db.transaction((tx) => {
      const validationMessage = [
        similarImportExists
          ? "Un import similaire existe déjà. Vérifiez l’historique avant de créer de nouveaux brouillons."
          : null,
        getImportValidationMessage(validation)
      ]
        .filter(Boolean)
        .join(" ");

      tx.insert(imports)
        .values({
          id: importId,
          workspaceId: access.workspaceId,
          uploadedBy: access.userId,
          sourceType: "csv",
          status: "parsed",
          originalFilename: file.name,
          storagePath: storedImport.storageKey,
          fileSize: file.size,
          detectedColumns: validation.columns,
          errorMessage: validationMessage || null,
          rowCount: validation.summary.totalRows
        })
        .run();

      if (validation.rows.length > 0) {
        tx.insert(importRows)
          .values(
            validation.rows.map((row) => ({
              id: createServerId("row"),
              workspaceId: access.workspaceId,
              importId,
              rowIndex: row.rowIndex,
              rawData: row.rawData,
              errorMessage: row.errorMessage,
              status: row.status
            }))
          )
          .run();
      }
    });

    logImportEvent(access, importId, validation.summary, "parsed");
  } catch (error) {
    const message =
      error instanceof TypeError
        ? "Le fichier CSV ne semble pas être encodé en UTF-8."
        : error instanceof CsvImportValidationError
          ? error.message
          : "Le CSV n’a pas pu être analysé. Vérifiez son contenu puis réessayez.";
    const emptySummary: CsvImportValidationSummary = {
      invalidRows: 0,
      readyRows: 0,
      skippedRows: 0,
      totalRows: 0,
      warningRows: 0
    };

    db.insert(imports)
      .values({
        id: importId,
        workspaceId: access.workspaceId,
        uploadedBy: access.userId,
        sourceType: "csv",
        status: "failed",
        originalFilename: file.name,
        storagePath: storedImport.storageKey,
        fileSize: file.size,
        rowCount: 0,
        errorMessage: message
      })
      .run();

    logImportEvent(access, importId, emptySummary, "failed");
  }

  return importId;
}

export { CsvImportValidationError };
