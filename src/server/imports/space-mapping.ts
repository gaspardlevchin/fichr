import { normalizeImportedSpaceName } from "../spaces/core.ts";
import type { ColumnMapping, RawImportRow } from "../../types/import.ts";

export function getMappedSpaceName(
  rawData: RawImportRow,
  mapping: ColumnMapping
): string | null {
  const column = mapping.space_name;

  if (!column) {
    return null;
  }

  const value = rawData[column];
  return typeof value === "string" ? normalizeImportedSpaceName(value) : null;
}
