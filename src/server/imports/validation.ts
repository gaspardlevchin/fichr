import type { ImportRowStatus, RawImportRow } from "@/types/import";

export type CsvValidationLevel = "warning" | "error";

export type CsvValidationIssue = {
  code: string;
  level: CsvValidationLevel;
  message: string;
};

export type CsvRowValidationResult = {
  errorMessage: string | null;
  rawData: RawImportRow;
  rowIndex: number;
  status: ImportRowStatus;
};

export type CsvImportValidationSummary = {
  invalidRows: number;
  readyRows: number;
  skippedRows: number;
  totalRows: number;
  warningRows: number;
};

export type CsvImportValidationResult = {
  blockingErrors: CsvValidationIssue[];
  columnIssues: CsvValidationIssue[];
  columns: string[];
  delimiter: "," | ";" | "\t";
  rows: CsvRowValidationResult[];
  summary: CsvImportValidationSummary;
};

const invisibleCharactersPattern = /[\u200B-\u200D\uFEFF]/g;
const titleAliases = new Set(["title", "name", "product name", "nom", "nom produit", "produit"]);
const imageAliases = new Set(["image", "image_url", "image url", "photo", "visuel"]);
const skuAliases = new Set(["sku", "reference", "référence", "ref"]);
const spaceAliases = new Set([
  "space",
  "space name",
  "space_name",
  "espace",
  "collection",
  "projet"
]);
const priceAliasFragments = [
  "price",
  "prix",
  "cost",
  "cout",
  "coût",
  "margin",
  "marge"
];

function isNonEmptyCsvRecord(record: string[]): boolean {
  return record.some((value) => value.trim().length > 0);
}

function parseCsvRecords(input: string, delimiter: "," | ";" | "\t"): string[][] {
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
    throw new Error("La citation CSV n’est pas fermée.");
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    records.push(row);
  }

  return records;
}

function normalizeHeaderKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanCell(value: string): {
  changed: boolean;
  value: string;
} {
  const withoutInvisible = value.replace(invisibleCharactersPattern, "");
  const trimmed = withoutInvisible.trim();

  return {
    changed: trimmed !== value,
    value: trimmed
  };
}

function detectDelimiter(input: string): "," | ";" | "\t" {
  const firstLine =
    input
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .find((line) => line.trim().length > 0) ?? "";
  const candidates: Array<"," | ";" | "\t"> = [",", ";", "\t"];

  return candidates.reduce((bestDelimiter, delimiter) => {
    const bestCount = firstLine.split(bestDelimiter).length;
    const delimiterCount = firstLine.split(delimiter).length;
    return delimiterCount > bestCount ? delimiter : bestDelimiter;
  }, ",");
}

function looksLikeValueInsteadOfHeader(value: string): boolean {
  const normalized = value.replace(/[€$£\s\u00a0]/g, "").replace(",", ".");

  return (
    value.trim().length === 0 ||
    /^-?\d+(\.\d+)?$/.test(normalized) ||
    /^https?:\/\//i.test(value)
  );
}

function createUniqueColumns(headerRecord: string[]): {
  columns: string[];
  issues: CsvValidationIssue[];
} {
  const seen = new Map<string, number>();
  const issues: CsvValidationIssue[] = [];
  const columns = headerRecord.map((rawColumn, index) => {
    const cleaned = cleanCell(rawColumn);
    const baseName = cleaned.value || `column_${index + 1}`;

    if (!cleaned.value) {
      issues.push({
        code: "unnamed_column",
        level: "warning",
        message: `La colonne ${index + 1} n’avait pas de nom et a été renommée ${baseName}.`
      });
    } else if (cleaned.changed) {
      issues.push({
        code: "trimmed_column",
        level: "warning",
        message: `La colonne ${index + 1} contenait des espaces ou caractères invisibles retirés.`
      });
    }

    const count = seen.get(baseName) ?? 0;
    seen.set(baseName, count + 1);

    if (count > 0) {
      const uniqueName = `${baseName}_${count + 1}`;
      issues.push({
        code: "duplicate_column",
        level: "warning",
        message: `La colonne dupliquée ${baseName} a été renommée ${uniqueName}.`
      });
      return uniqueName;
    }

    return baseName;
  });

  return { columns, issues };
}

function isPriceColumn(column: string): boolean {
  const normalized = normalizeHeaderKey(column);
  return priceAliasFragments.some((fragment) => normalized.includes(fragment));
}

function isImageColumn(column: string): boolean {
  return imageAliases.has(normalizeHeaderKey(column));
}

function findTitleColumn(columns: string[]): string | null {
  return columns.find((column) => titleAliases.has(normalizeHeaderKey(column))) ?? null;
}

function parsePriceLikeValue(value: string): boolean {
  const normalized = value
    .replace(/[€$£\s\u00a0]/g, "")
    .replace(/\b(eur|usd|gbp)\b/gi, "")
    .replace(",", ".")
    .trim();

  return normalized.length === 0 || /^-?\d+(\.\d+)?$/.test(normalized);
}

function isValidImageUrl(value: string): boolean {
  if (value.startsWith("/")) {
    return true;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function summarizeIssues(issues: CsvValidationIssue[]): string | null {
  return issues.length > 0
    ? issues.map((issue) => issue.message).join(" ")
    : null;
}

function buildRawData(columns: string[], record: string[]): {
  rawData: RawImportRow;
  warnings: CsvValidationIssue[];
} {
  const warnings: CsvValidationIssue[] = [];
  const rawData = Object.fromEntries(
    columns.map((column, index) => {
      const cleaned = cleanCell(record[index] ?? "");

      if (cleaned.changed) {
        warnings.push({
          code: "trimmed_value",
          level: "warning",
          message: `La valeur de ${column} contenait des espaces ou caractères invisibles retirés.`
        });
      }

      return [column, cleaned.value];
    })
  );

  return { rawData, warnings };
}

function validateRow(input: {
  columns: string[];
  record: string[];
  rowIndex: number;
  seenDuplicateKeys: Set<string>;
  titleColumn: string | null;
}): CsvRowValidationResult {
  if (!isNonEmptyCsvRecord(input.record)) {
    return {
      errorMessage: "Ligne vide ignorée.",
      rawData: {},
      rowIndex: input.rowIndex,
      status: "skipped"
    };
  }

  const errors: CsvValidationIssue[] = [];
  const { rawData, warnings } = buildRawData(input.columns, input.record);

  if (input.record.length < input.columns.length) {
    errors.push({
      code: "too_few_values",
      level: "error",
      message: "La ligne contient moins de valeurs que l’en-tête."
    });
  }

  if (input.record.length > input.columns.length) {
    errors.push({
      code: "too_many_values",
      level: "error",
      message: "La ligne contient plus de valeurs que l’en-tête."
    });
  }

  for (const column of input.columns) {
    const value = rawData[column];

    if (value.length === 0) {
      continue;
    }

    if (isPriceColumn(column) && !parsePriceLikeValue(value)) {
      errors.push({
        code: "invalid_price",
        level: "error",
        message: `Le prix de la colonne ${column} est mal formé.`
      });
    }

    if (isImageColumn(column) && !isValidImageUrl(value)) {
      errors.push({
        code: "invalid_image_url",
        level: "error",
        message: `L’URL image de la colonne ${column} semble invalide.`
      });
    }
  }

  if (input.titleColumn && !rawData[input.titleColumn]) {
    errors.push({
      code: "missing_title",
      level: "error",
      message: "Le titre produit est manquant."
    });
  }

  const priceColumn = input.columns.find((column) => isPriceColumn(column));
  const skuColumn = input.columns.find((column) =>
    skuAliases.has(normalizeHeaderKey(column))
  );
  const spaceColumn = input.columns.find((column) =>
    spaceAliases.has(normalizeHeaderKey(column))
  );
  const skuValue = skuColumn ? rawData[skuColumn].toLowerCase() : "";
  const titleValue = input.titleColumn
    ? rawData[input.titleColumn].toLowerCase()
    : "";
  const duplicateKey = skuValue
    ? `sku:${skuValue}`
    : titleValue && spaceColumn
      ? `title-space:${titleValue}|${rawData[spaceColumn].toLowerCase()}`
      : titleValue && priceColumn
        ? `title-price:${titleValue}|${rawData[priceColumn]}`
        : null;

  if (duplicateKey && input.seenDuplicateKeys.has(duplicateKey)) {
    return {
      errorMessage:
        "Ligne en double ignorée : même référence ou mêmes données d’identification.",
      rawData,
      rowIndex: input.rowIndex,
      status: "skipped"
    };
  }

  if (duplicateKey) {
    input.seenDuplicateKeys.add(duplicateKey);
  }

  if (errors.length > 0) {
    return {
      errorMessage: summarizeIssues(errors),
      rawData,
      rowIndex: input.rowIndex,
      status: "error"
    };
  }

  return {
    errorMessage: summarizeIssues(warnings),
    rawData,
    rowIndex: input.rowIndex,
    status: "ready"
  };
}

function summarizeRows(
  rows: CsvRowValidationResult[]
): CsvImportValidationSummary {
  return {
    invalidRows: rows.filter((row) => row.status === "error").length,
    readyRows: rows.filter(
      (row) => row.status === "ready" && !row.errorMessage
    ).length,
    skippedRows: rows.filter((row) => row.status === "skipped").length,
    totalRows: rows.length,
    warningRows: rows.filter(
      (row) => row.status === "ready" && Boolean(row.errorMessage)
    ).length
  };
}

export function validateCsvRowData(input: {
  columns: string[];
  rawData: RawImportRow;
  rowIndex: number;
}): CsvRowValidationResult {
  const titleColumn = findTitleColumn(input.columns);
  const record = input.columns.map((column) => input.rawData[column] ?? "");

  return validateRow({
    columns: input.columns,
    record,
    rowIndex: input.rowIndex,
    seenDuplicateKeys: new Set<string>(),
    titleColumn
  });
}

export function validateCsvImport(input: string): CsvImportValidationResult {
  const delimiter = detectDelimiter(input);
  const records = parseCsvRecords(input, delimiter);
  const firstRecordIndex = records.findIndex(isNonEmptyCsvRecord);

  if (firstRecordIndex === -1) {
    return {
      blockingErrors: [
        {
          code: "empty_file",
          level: "error",
          message: "Le fichier CSV est vide."
        }
      ],
      columnIssues: [],
      columns: [],
      delimiter,
      rows: [],
      summary: {
        invalidRows: 0,
        readyRows: 0,
        skippedRows: 0,
        totalRows: 0,
        warningRows: 0
      }
    };
  }

  const headerRecord = records[firstRecordIndex];

  if (
    headerRecord.length === 0 ||
    headerRecord.every((value) => value.trim().length === 0) ||
    headerRecord.every(looksLikeValueInsteadOfHeader)
  ) {
    return {
      blockingErrors: [
        {
          code: "missing_header",
          level: "error",
          message: "La ligne d en-tete du CSV est manquante ou inexploitable."
        }
      ],
      columnIssues: [],
      columns: [],
      delimiter,
      rows: [],
      summary: {
        invalidRows: 0,
        readyRows: 0,
        skippedRows: 0,
        totalRows: 0,
        warningRows: 0
      }
    };
  }

  const { columns, issues } = createUniqueColumns(headerRecord);
  const titleColumn = findTitleColumn(columns);
  const seenDuplicateKeys = new Set<string>();
  const rows = records
    .slice(firstRecordIndex + 1)
    .map((record, index) =>
      validateRow({
        columns,
        record,
        rowIndex: index + 1,
        seenDuplicateKeys,
        titleColumn
      })
    );

  return {
    blockingErrors: [],
    columnIssues: issues,
    columns,
    delimiter,
    rows,
    summary: summarizeRows(rows)
  };
}

export function assertCsvImportCanProceed(
  validation: CsvImportValidationResult
): void {
  if (validation.blockingErrors.length > 0) {
    throw new Error(
      validation.blockingErrors.map((issue) => issue.message).join(" ")
    );
  }
}
