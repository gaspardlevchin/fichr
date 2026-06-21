import type { RawImportRow } from "@/types/import";

export const MAX_CSV_IMPORT_BYTES = 2 * 1024 * 1024;
export const IMPORT_PREVIEW_ROW_LIMIT = 5;

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvParseError";
  }
}

export type ParsedCsv = {
  columns: string[];
  rows: RawImportRow[];
};

export function isNonEmptyCsvRecord(record: string[]): boolean {
  return record.some((value) => value.trim().length > 0);
}

export function parseCsvRecords(input: string, delimiter = ","): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      records.push(row);
      row = [];
      field = "";
    } else if (char === "\r") {
      row.push(field);
      records.push(row);
      row = [];
      field = "";
      if (nextChar === "\n") {
        index += 1;
      }
    } else {
      field += char;
    }
  }

  if (inQuotes) {
    throw new CsvParseError("CSV quote is not closed.");
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    records.push(row);
  }

  return records;
}

function normalizeColumns(record: string[]): string[] {
  const seen = new Map<string, number>();

  return record.map((value, index) => {
    const baseName = value.trim() || `column_${index + 1}`;
    const count = seen.get(baseName) ?? 0;
    seen.set(baseName, count + 1);

    return count === 0 ? baseName : `${baseName}_${count + 1}`;
  });
}

export function parseCsv(input: string): ParsedCsv {
  const records = parseCsvRecords(input).filter(isNonEmptyCsvRecord);

  if (records.length === 0) {
    throw new CsvParseError("CSV file is empty.");
  }

  const columns = normalizeColumns(records[0]);

  if (columns.length === 0) {
    throw new CsvParseError("CSV header row is missing.");
  }

  const rows = records.slice(1).map((record) =>
    Object.fromEntries(
      columns.map((column, index) => [column, record[index] ?? ""])
    )
  );

  return { columns, rows };
}
