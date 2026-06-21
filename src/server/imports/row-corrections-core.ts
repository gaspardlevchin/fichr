import type { RawImportRow } from "@/types/import";

export type ImportRowCorrectionLogInput = {
  correctedFieldCount: number;
  importId: string;
  newStatus: string;
  previousStatus: string;
  rowId: string;
};

export function getEffectiveImportRowData(input: {
  correctedData: RawImportRow | null;
  rawData: RawImportRow;
}): RawImportRow {
  return input.correctedData ?? input.rawData;
}

export function getEditableImportRowData(input: {
  columns: string[];
  correctedData: RawImportRow | null;
  rawData: RawImportRow;
}): RawImportRow {
  const source = getEffectiveImportRowData(input);

  return Object.fromEntries(
    input.columns.map((column) => [column, source[column] ?? ""])
  );
}

export function countCorrectedImportRowFields(input: {
  columns: string[];
  correctedData: RawImportRow;
  rawData: RawImportRow;
}): number {
  return input.columns.filter(
    (column) =>
      (input.rawData[column] ?? "") !== (input.correctedData[column] ?? "")
  ).length;
}

export function createImportRowCorrectionLogMetadata(
  input: ImportRowCorrectionLogInput
) {
  return {
    import_id: input.importId,
    row_id: input.rowId,
    previous_status: input.previousStatus,
    new_status: input.newStatus,
    corrected_fields_count: input.correctedFieldCount
  };
}
