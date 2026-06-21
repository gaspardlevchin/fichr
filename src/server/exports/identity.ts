import { createHash, randomBytes } from "node:crypto";

import type {
  CatalogExportScope,
  ExportIdentity
} from "../../types/export";
import type { ValidatedExportProduct } from "./core";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, stableValue(nestedValue)])
    );
  }

  return value;
}

export function createSha256Hash(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

export function createExportDataHash(
  products: readonly ValidatedExportProduct[]
): string {
  const canonicalProducts = [...products]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((product) => ({
      id: product.id,
      validatedData: stableValue(product.validatedData)
    }));

  return createSha256Hash(JSON.stringify(canonicalProducts));
}

export function createExportCode(
  generatedAt = new Date(),
  entropy = randomBytes(6)
): string {
  const year = generatedAt.getUTCFullYear();
  const suffix = Buffer.from(entropy).toString("hex").toUpperCase();

  return `FICHR-EXP-${year}-${suffix}`;
}

export function getExportScope(
  selectedProductIds: readonly string[] | undefined
): CatalogExportScope {
  if (!selectedProductIds) {
    return "catalog";
  }

  return selectedProductIds.length === 1 ? "product" : "selection";
}

export function createExportFilename(
  exportCode: string,
  extension: "txt" | "csv" | "pdf"
): string {
  if (!/^FICHR-EXP-\d{4}-[A-F0-9]{12}$/.test(exportCode)) {
    throw new Error("Invalid export code.");
  }

  return `fichr-export-${exportCode}.${extension}`;
}

export function getShortExportHash(dataHash: string): string {
  return dataHash.slice(0, 12).toUpperCase();
}

export function createExportIdentity(input: ExportIdentity): ExportIdentity {
  return Object.freeze({ ...input });
}
