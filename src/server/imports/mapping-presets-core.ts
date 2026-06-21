export type CsvMappingPresetMatchType = "exact" | "partial";
export type CsvPresetColumnMapping = Record<string, string>;

export type CsvMappingPresetRecord = {
  columns: string[];
  columnSignature: string;
  id: string;
  mapping: CsvPresetColumnMapping;
  name: string;
  usageCount: number;
};

export type CsvMappingPresetMatch = {
  id: string;
  mappedFieldCount: number;
  mapping: CsvPresetColumnMapping;
  matchType: CsvMappingPresetMatchType;
  name: string;
  usageCount: number;
};

export function createColumnSignature(columns: string[]): string {
  return JSON.stringify(columns);
}

function filterMappingToColumns(
  mapping: CsvPresetColumnMapping,
  columns: string[]
): CsvPresetColumnMapping {
  const allowedColumns = new Set(columns);

  return Object.fromEntries(
    Object.entries(mapping).filter(([, column]) => allowedColumns.has(column))
  );
}

function getMappedFieldCount(mapping: CsvPresetColumnMapping): number {
  return Object.keys(mapping).length;
}

export function getPresetMatch(
  preset: CsvMappingPresetRecord,
  columns: string[]
): CsvMappingPresetMatch | null {
  const columnSignature = createColumnSignature(columns);
  const mapping = filterMappingToColumns(preset.mapping, columns);
  const mappedFieldCount = getMappedFieldCount(mapping);

  if (mappedFieldCount === 0) {
    return null;
  }

  if (preset.columnSignature === columnSignature) {
    return {
      id: preset.id,
      mappedFieldCount,
      mapping,
      matchType: "exact",
      name: preset.name,
      usageCount: preset.usageCount
    };
  }

  const originalMappedFieldCount = getMappedFieldCount(preset.mapping);
  const matchRatio =
    originalMappedFieldCount > 0 ? mappedFieldCount / originalMappedFieldCount : 0;

  if (mappedFieldCount >= 2 && matchRatio >= 0.6) {
    return {
      id: preset.id,
      mappedFieldCount,
      mapping,
      matchType: "partial",
      name: preset.name,
      usageCount: preset.usageCount
    };
  }

  return null;
}

export function findBestPresetMatch(
  presets: CsvMappingPresetRecord[],
  columns: string[]
): CsvMappingPresetMatch | null {
  let partialMatch: CsvMappingPresetMatch | null = null;

  for (const preset of presets) {
    const match = getPresetMatch(preset, columns);

    if (!match) {
      continue;
    }

    if (match.matchType === "exact") {
      return match;
    }

    partialMatch ??= match;
  }

  return partialMatch;
}
