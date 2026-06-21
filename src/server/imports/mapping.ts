import { and, eq, sql } from "drizzle-orm";

import { imports } from "../../../db/schema";
import { logEvent } from "@/server/audit/event-log";
import { getCsvImportWriteAccess } from "@/server/imports/service";
import { db } from "@/server/db/client";
import { assertImportMappingComplete } from "@/server/imports/creation-core";
import {
  ImportMappingIncompleteError,
  ImportRowsInvalidError,
  ImportWorkspaceForbiddenError
} from "@/server/imports/errors";
import { upsertCsvMappingPreset } from "@/server/imports/mapping-presets";
import {
  importMappingFieldKeys,
  type ColumnMapping,
  type StandardProductField
} from "@/types/import";

export { suggestColumnMapping } from "@/server/imports/mapping-core";

export const IGNORE_COLUMN_VALUE = "__ignore__";

export const standardProductFields: StandardProductField[] = [
  { key: "title", label: "Titre", recommended: true },
  { key: "subtitle", label: "Sous-titre", recommended: false },
  { key: "category", label: "Categorie", recommended: true },
  { key: "description", label: "Description", recommended: true },
  { key: "materials", label: "Matieres", recommended: false },
  { key: "dimensions", label: "Dimensions", recommended: false },
  { key: "origin", label: "Origine", recommended: false },
  { key: "current_price", label: "Prix actuel", recommended: true },
  { key: "desired_price", label: "Prix souhaite", recommended: false },
  { key: "cost_price", label: "Prix de revient", recommended: false },
  { key: "target_margin", label: "Marge cible", recommended: false },
  { key: "sku", label: "SKU", recommended: false },
  { key: "image_url", label: "Image URL", recommended: false },
  { key: "client_notes", label: "Notes client", recommended: false },
  { key: "space_name", label: "Espace", recommended: false }
];

function parseMappingFormData(
  formData: FormData,
  detectedColumns: string[]
): ColumnMapping {
  const allowedColumns = new Set(detectedColumns);
  const mapping: ColumnMapping = {};

  for (const field of importMappingFieldKeys) {
    const value = formData.get(`mapping.${field}`);

    if (
      typeof value !== "string" ||
      value.length === 0 ||
      value === IGNORE_COLUMN_VALUE
    ) {
      continue;
    }

    if (!allowedColumns.has(value)) {
      throw new ImportMappingIncompleteError(
        "Une colonne sélectionnée n’existe pas dans ce CSV. Corrigez le mapping."
      );
    }

    mapping[field] = value;
  }

  return mapping;
}

export async function saveColumnMapping(
  importId: string,
  formData: FormData
): Promise<void> {
  const access = await getCsvImportWriteAccess();
  const importRecord = db
    .select({
      detectedColumns: imports.detectedColumns,
      status: imports.status
    })
    .from(imports)
    .where(and(eq(imports.id, importId), eq(imports.workspaceId, access.workspaceId)))
    .limit(1)
    .get();

  if (!importRecord) {
    throw new ImportWorkspaceForbiddenError();
  }

  if (importRecord.status === "failed") {
    throw new ImportRowsInvalidError(
      "Cet import contient une erreur bloquante et ne peut pas être mappé."
    );
  }

  const columnMapping = parseMappingFormData(
    formData,
    importRecord.detectedColumns
  );
  assertImportMappingComplete(columnMapping);
  const mappedFieldCount = Object.keys(columnMapping).length;

  db.update(imports)
    .set({
      columnMapping,
      status: "mapped",
      updatedAt: sql`CURRENT_TIMESTAMP`
    })
    .where(and(eq(imports.id, importId), eq(imports.workspaceId, access.workspaceId)))
    .run();

  upsertCsvMappingPreset({
    columns: importRecord.detectedColumns,
    mapping: columnMapping,
    workspaceId: access.workspaceId
  });

  logEvent({
    workspaceId: access.workspaceId,
    actorUserId: access.userId,
    action: "import.mapping",
    entityType: "import",
    entityId: importId,
    metadata: {
      import_id: importId,
      status: "mapped",
      mapped_field_count: mappedFieldCount
    }
  });
}
