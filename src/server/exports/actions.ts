"use server";

import { redirect } from "next/navigation";

import {
  createCatalogExport,
  deleteCatalogExport
} from "@/server/exports/service";
import { catalogExportTypes, type CatalogExportType } from "@/types/export";

function parseExportType(value: FormDataEntryValue | null): CatalogExportType {
  if (
    typeof value === "string" &&
    catalogExportTypes.includes(value as CatalogExportType)
  ) {
    return value as CatalogExportType;
  }

  throw new Error("Unsupported export type.");
}

function parseSelectedProductIds(formData: FormData): string[] | undefined {
  if (formData.get("exportMode") !== "selected") {
    return undefined;
  }

  const productIds = formData
    .getAll("productIds")
    .filter((value): value is string => typeof value === "string")
    .map((productId) => productId.trim())
    .filter(Boolean);

  if (productIds.length === 0) {
    throw new Error("Selectionnez au moins un produit valide a exporter.");
  }

  return productIds;
}

export async function createCatalogExportAction(
  formData: FormData
): Promise<void> {
  let exportId: string;

  try {
    const exportType = parseExportType(formData.get("exportType"));
    const selectedProductIds = parseSelectedProductIds(formData);
    const result = await createCatalogExport(exportType, selectedProductIds);
    exportId = result.exportId;
  } catch (error) {
    const message = encodeURIComponent(
      error instanceof Error ? error.message : "Export failed."
    );
    redirect(`/exports?error=${message}`);
  }

  redirect(`/exports?created=${encodeURIComponent(exportId)}`);
}

export async function deleteCatalogExportAction(
  formData: FormData
): Promise<void> {
  const exportId = formData.get("exportId");

  if (typeof exportId !== "string" || exportId.length === 0) {
    redirect("/exports?error=Export%20introuvable.");
  }

  try {
    await deleteCatalogExport(exportId);
  } catch (error) {
    const message = encodeURIComponent(
      error instanceof Error ? error.message : "Export deletion failed."
    );
    redirect(`/exports?error=${message}`);
  }

  redirect(`/exports?deleted=${encodeURIComponent(exportId)}`);
}
