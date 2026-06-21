import { and, desc, eq, sql } from "drizzle-orm";

import { csvMappingPresets, imports } from "../../../db/schema";
import { logEvent } from "@/server/audit/event-log";
import { db } from "@/server/db/client";
import { assertImportMappingComplete } from "@/server/imports/creation-core";
import {
  ImportMappingIncompleteError,
  ImportRowsInvalidError,
  ImportWorkspaceForbiddenError
} from "@/server/imports/errors";
import { createServerId } from "@/server/ids";
import { getCsvImportWriteAccess } from "@/server/imports/service";
import {
  createColumnSignature,
  findBestPresetMatch,
  getPresetMatch,
  type CsvMappingPresetRecord
} from "@/server/imports/mapping-presets-core";
import type {
  ColumnMapping,
  CsvMappingPresetSuggestion
} from "@/types/import";

function getPresetName(columns: string[]): string {
  return `Mapping CSV - ${columns.length} colonnes`;
}

function toPresetRecord(input: {
  columnSignature: string;
  columns: string[];
  id: string;
  mapping: ColumnMapping;
  name: string;
  usageCount: number;
}): CsvMappingPresetRecord {
  return {
    columnSignature: input.columnSignature,
    columns: input.columns,
    id: input.id,
    mapping: input.mapping as Record<string, string>,
    name: input.name,
    usageCount: input.usageCount
  };
}

function toPresetSuggestion(
  match: ReturnType<typeof findBestPresetMatch>
): CsvMappingPresetSuggestion | null {
  if (!match) {
    return null;
  }

  return {
    id: match.id,
    mappedFieldCount: match.mappedFieldCount,
    mapping: match.mapping as ColumnMapping,
    matchType: match.matchType,
    name: match.name,
    usageCount: match.usageCount
  };
}

function incrementPresetUsage(workspaceId: string, presetId: string): void {
  db.update(csvMappingPresets)
    .set({
      lastUsedAt: sql`CURRENT_TIMESTAMP`,
      updatedAt: sql`CURRENT_TIMESTAMP`,
      usageCount: sql`${csvMappingPresets.usageCount} + 1`
    })
    .where(
      and(
        eq(csvMappingPresets.id, presetId),
        eq(csvMappingPresets.workspaceId, workspaceId)
      )
    )
    .run();
}

export function getCompatibleCsvMappingPreset(
  workspaceId: string,
  columns: string[]
): CsvMappingPresetSuggestion | null {
  const presets = db
    .select({
      columnSignature: csvMappingPresets.columnSignature,
      columns: csvMappingPresets.columns,
      id: csvMappingPresets.id,
      mapping: csvMappingPresets.mapping,
      name: csvMappingPresets.name,
      usageCount: csvMappingPresets.usageCount
    })
    .from(csvMappingPresets)
    .where(eq(csvMappingPresets.workspaceId, workspaceId))
    .orderBy(desc(csvMappingPresets.lastUsedAt), desc(csvMappingPresets.usageCount))
    .all()
    .map(toPresetRecord);

  return toPresetSuggestion(findBestPresetMatch(presets, columns));
}

export function upsertCsvMappingPreset(input: {
  columns: string[];
  mapping: ColumnMapping;
  workspaceId: string;
}): void {
  const mappedFieldCount = Object.keys(input.mapping).length;

  if (mappedFieldCount === 0) {
    return;
  }

  const columnSignature = createColumnSignature(input.columns);
  const existingPreset = db
    .select({ id: csvMappingPresets.id })
    .from(csvMappingPresets)
    .where(
      and(
        eq(csvMappingPresets.workspaceId, input.workspaceId),
        eq(csvMappingPresets.columnSignature, columnSignature)
      )
    )
    .limit(1)
    .get();

  if (existingPreset) {
    db.update(csvMappingPresets)
      .set({
        columns: input.columns,
        lastUsedAt: sql`CURRENT_TIMESTAMP`,
        mapping: input.mapping,
        name: getPresetName(input.columns),
        updatedAt: sql`CURRENT_TIMESTAMP`,
        usageCount: sql`${csvMappingPresets.usageCount} + 1`
      })
      .where(
        and(
          eq(csvMappingPresets.id, existingPreset.id),
          eq(csvMappingPresets.workspaceId, input.workspaceId)
        )
      )
      .run();
    return;
  }

  db.insert(csvMappingPresets)
    .values({
      id: createServerId("map"),
      workspaceId: input.workspaceId,
      name: getPresetName(input.columns),
      columnSignature,
      columns: input.columns,
      mapping: input.mapping,
      lastUsedAt: sql`CURRENT_TIMESTAMP`
    })
    .run();
}

export async function applyCsvMappingPresetToImport(
  importId: string,
  presetId: string
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
      "Cet import contient une erreur bloquante et ne peut pas recevoir de mapping."
    );
  }

  const preset = db
    .select({
      columnSignature: csvMappingPresets.columnSignature,
      columns: csvMappingPresets.columns,
      id: csvMappingPresets.id,
      mapping: csvMappingPresets.mapping,
      name: csvMappingPresets.name,
      usageCount: csvMappingPresets.usageCount
    })
    .from(csvMappingPresets)
    .where(
      and(
        eq(csvMappingPresets.id, presetId),
        eq(csvMappingPresets.workspaceId, access.workspaceId)
      )
    )
    .limit(1)
    .get();

  if (!preset) {
    throw new ImportWorkspaceForbiddenError(
      "Mapping précédent introuvable ou inaccessible dans ce workspace."
    );
  }

  const match = getPresetMatch(
    toPresetRecord(preset),
    importRecord.detectedColumns
  );

  if (!match) {
    throw new ImportMappingIncompleteError(
      "Ce mapping précédent n’est pas compatible avec les colonnes de cet import."
    );
  }

  assertImportMappingComplete(match.mapping as ColumnMapping);
  db.update(imports)
    .set({
      columnMapping: match.mapping as ColumnMapping,
      status: "mapped",
      updatedAt: sql`CURRENT_TIMESTAMP`
    })
    .where(and(eq(imports.id, importId), eq(imports.workspaceId, access.workspaceId)))
    .run();

  incrementPresetUsage(access.workspaceId, preset.id);

  logEvent({
    workspaceId: access.workspaceId,
    actorUserId: access.userId,
    action: "import.mapping",
    entityType: "import",
    entityId: importId,
    metadata: {
      import_id: importId,
      status: "mapped",
      mapped_field_count: match.mappedFieldCount
    }
  });
}
