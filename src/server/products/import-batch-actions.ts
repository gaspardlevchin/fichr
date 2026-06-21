"use server";

import { redirect } from "next/navigation";

import {
  auditImportedProductBatch,
  restoreImportedProductBatch,
  softDeleteImportedProductBatch
} from "@/server/products/import-batch";

function getRequiredFormValue(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

export async function auditImportedProductBatchAction(
  formData: FormData
): Promise<void> {
  const importId = getRequiredFormValue(formData, "importId");

  if (!importId) {
    redirect("/catalog?batch_error=Import%20introuvable.");
  }

  let redirectTarget: string;

  try {
    const result = await auditImportedProductBatch(importId);
    redirectTarget = `/catalog?import=${encodeURIComponent(importId)}&batch_audited=${result.auditedProductCount}&batch_audit_skipped=${result.skippedDeletedCount}`;
  } catch (error) {
    const message = encodeURIComponent(
      error instanceof Error ? error.message : "Audit du lot impossible."
    );
    redirectTarget = `/catalog?import=${encodeURIComponent(importId)}&batch_error=${message}`;
  }

  redirect(redirectTarget);
}

export async function softDeleteImportedProductBatchAction(
  formData: FormData
): Promise<void> {
  const importId = getRequiredFormValue(formData, "importId");
  const confirmation = getRequiredFormValue(formData, "confirmation");

  if (!importId) {
    redirect("/catalog?batch_error=Import%20introuvable.");
  }

  let redirectTarget: string;

  try {
    const result = await softDeleteImportedProductBatch({
      confirmation,
      importId
    });
    redirectTarget = `/catalog?import=${encodeURIComponent(importId)}&deleted=deleted&batch_deleted=${result.deletedProductCount}&batch_delete_skipped=${result.alreadyDeletedCount}`;
  } catch (error) {
    const message = encodeURIComponent(
      error instanceof Error ? error.message : "Masquage du lot impossible."
    );
    redirectTarget = `/catalog?import=${encodeURIComponent(importId)}&batch_error=${message}`;
  }

  redirect(redirectTarget);
}

export async function restoreImportedProductBatchAction(
  formData: FormData
): Promise<void> {
  const importId = getRequiredFormValue(formData, "importId");
  const confirmation = getRequiredFormValue(formData, "confirmation");

  if (!importId) {
    redirect("/catalog?batch_error=Import%20introuvable.");
  }

  let redirectTarget: string;

  try {
    const result = await restoreImportedProductBatch({
      confirmation,
      importId
    });
    redirectTarget = `/catalog?import=${encodeURIComponent(importId)}&batch_restored=${result.restoredProductCount}&batch_restore_skipped=${result.activeProductCount}`;
  } catch (error) {
    const message = encodeURIComponent(
      error instanceof Error ? error.message : "Restauration du lot impossible."
    );
    redirectTarget = `/catalog?import=${encodeURIComponent(importId)}&deleted=deleted&batch_error=${message}`;
  }

  redirect(redirectTarget);
}
