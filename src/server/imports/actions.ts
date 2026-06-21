"use server";

import { redirect } from "next/navigation";

import {
  createCsvImport
} from "@/server/imports/service";
import { getImportActionErrorMessage } from "@/server/imports/errors";
import { applyCsvMappingPresetToImport } from "@/server/imports/mapping-presets";
import { correctImportRowFromForm } from "@/server/imports/row-corrections";
import { saveColumnMapping } from "@/server/imports/mapping";
import { createDraftProductsFromImport } from "@/server/products/import-products";

function toImportErrorMessage(error: unknown): string {
  return getImportActionErrorMessage(error);
}

function rethrowNextNavigationError(error: unknown): void {
  if (
    error &&
    typeof error === "object" &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  ) {
    throw error;
  }
}

export async function importCsvAction(formData: FormData): Promise<void> {
  const file = formData.get("csvFile");

  if (!(file instanceof File)) {
    redirect("/imports?error=Select%20a%20CSV%20file.");
  }

  let importId: string;

  try {
    importId = await createCsvImport(file);
  } catch (error) {
    rethrowNextNavigationError(error);
    const message = encodeURIComponent(toImportErrorMessage(error));
    redirect(`/imports?error=${message}`);
  }

  redirect(`/imports/${encodeURIComponent(importId)}`);
}

export async function validateColumnMappingAction(
  formData: FormData
): Promise<void> {
  const importId = formData.get("importId");

  if (typeof importId !== "string" || importId.length === 0) {
    redirect("/imports?error=Import%20missing.");
  }

  try {
    await saveColumnMapping(importId, formData);
  } catch (error) {
    rethrowNextNavigationError(error);
    const message = encodeURIComponent(toImportErrorMessage(error));
    redirect(`/imports/${encodeURIComponent(importId)}?error=${message}`);
  }

  redirect(`/imports/${encodeURIComponent(importId)}`);
}

export async function applyCsvMappingPresetAction(
  formData: FormData
): Promise<void> {
  const importId = formData.get("importId");
  const presetId = formData.get("presetId");

  if (typeof importId !== "string" || importId.length === 0) {
    redirect("/imports?error=Import%20missing.");
  }

  if (typeof presetId !== "string" || presetId.length === 0) {
    redirect(`/imports/${encodeURIComponent(importId)}?error=Preset%20missing.`);
  }

  try {
    await applyCsvMappingPresetToImport(importId, presetId);
  } catch (error) {
    rethrowNextNavigationError(error);
    const message = encodeURIComponent(toImportErrorMessage(error));
    redirect(`/imports/${encodeURIComponent(importId)}?error=${message}`);
  }

  redirect(`/imports/${encodeURIComponent(importId)}`);
}

export async function correctImportRowAction(formData: FormData): Promise<void> {
  const importId = formData.get("importId");
  const rowId = formData.get("rowId");
  const rowStatus = formData.get("rowStatus");

  if (typeof importId !== "string" || importId.length === 0) {
    redirect("/imports?error=Import%20missing.");
  }

  if (typeof rowId !== "string" || rowId.length === 0) {
    redirect(`/imports/${encodeURIComponent(importId)}?error=Row%20missing.`);
  }

  let redirectTarget: string;

  try {
    const result = await correctImportRowFromForm(importId, rowId, formData);
    const filter =
      typeof rowStatus === "string" && rowStatus.length > 0
        ? `&rowStatus=${encodeURIComponent(rowStatus)}`
        : "";
    const encodedStatus = encodeURIComponent(result.newStatus);

    redirectTarget = `/imports/${encodeURIComponent(importId)}?corrected=${encodedStatus}${filter}`;
  } catch (error) {
    rethrowNextNavigationError(error);
    const message = encodeURIComponent(toImportErrorMessage(error));
    redirectTarget = `/imports/${encodeURIComponent(importId)}?error=${message}`;
  }

  redirect(redirectTarget);
}

export async function createDraftProductsAction(
  formData: FormData
): Promise<void> {
  const importId = formData.get("importId");

  if (typeof importId !== "string" || importId.length === 0) {
    redirect("/imports?error=Import%20missing.");
  }

  let result;

  try {
    result = await createDraftProductsFromImport(importId);
  } catch (error) {
    rethrowNextNavigationError(error);
    const message = encodeURIComponent(toImportErrorMessage(error));
    redirect(`/imports/${encodeURIComponent(importId)}?error=${message}`);
  }

  redirect(
    `/imports/${encodeURIComponent(importId)}?created=${result.createdProductCount}&skipped=${result.skippedRowCount}`
  );
}
