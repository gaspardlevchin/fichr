"use server";

import { redirect } from "next/navigation";
import { and, eq, isNull, sql } from "drizzle-orm";

import { auditFindings, productAudits, products } from "../../../db/schema";
import { logEvent } from "@/server/audit/event-log";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { db } from "@/server/db/client";
import { productFieldKeys, type ProductFieldKey } from "@/types/import";
import {
  deleteProductWithConfirmation,
  restoreDeletedProduct
} from "@/server/products/deletion";
import {
  removeProductImage,
  replaceProductImage
} from "@/server/products/media";
import type {
  ProductDraftData,
  ProductDraftValue,
  ProductStatus
} from "@/types/product";

const productWriteRoles = ["owner", "admin", "editor"] as const;
const priceFields = new Set<ProductFieldKey>([
  "current_price",
  "desired_price",
  "cost_price",
  "target_margin"
]);

type ProductUpdateResult = {
  auditMarkedStaleCount: number;
  changedFieldCount: number;
  hasPriceParsingError: boolean;
  productId: string;
};

type ProductValidationResult = {
  auditStatus: "current" | "stale" | "none";
  blockingCount: number;
  productId: string;
  validationStatus: "validated";
};

function getFormString(formData: FormData, field: ProductFieldKey): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

function parsePriceValue(
  value: string,
  field: ProductFieldKey,
  parsingNotes: string[]
): ProductDraftValue {
  const normalized = value
    .replace(/[€\s\u00a0]/g, "")
    .replace(",", ".")
    .trim();

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    parsingNotes.push(`${field}: valeur prix conservee sans parsing`);
    return value;
  }

  return Number(normalized);
}

function buildDraftData(formData: FormData): ProductDraftData {
  const draftData: ProductDraftData = {};
  const parsingNotes: string[] = [];

  for (const field of productFieldKeys) {
    const value = getFormString(formData, field);

    if (value.length === 0) {
      continue;
    }

    draftData[field] = priceFields.has(field)
      ? parsePriceValue(value, field, parsingNotes)
      : value;
  }

  if (parsingNotes.length > 0) {
    draftData.parsing_notes = parsingNotes;
  }

  return draftData;
}

function normalizeDraftValue(value: ProductDraftValue | undefined): string {
  return value === undefined || value === null ? "" : String(value);
}

function countChangedFields(
  currentDraftData: ProductDraftData,
  nextDraftData: ProductDraftData
): number {
  return productFieldKeys.filter(
    (field) =>
      normalizeDraftValue(currentDraftData[field]) !==
      normalizeDraftValue(nextDraftData[field])
  ).length;
}

function getStringField(
  draftData: ProductDraftData,
  field: ProductFieldKey
): string | null {
  const value = draftData[field];
  return typeof value === "string" ? value : null;
}

function getNumberField(
  draftData: ProductDraftData,
  field: ProductFieldKey
): number | null {
  const value = draftData[field];
  return typeof value === "number" ? value : null;
}

function getProductTitle(draftData: ProductDraftData): string {
  const title = getStringField(draftData, "title");
  return title && title.length > 0 ? title : "Produit sans titre";
}

function getProductStatus(
  currentStatus: ProductStatus,
  draftData: ProductDraftData
): ProductStatus {
  if (currentStatus === "validated") {
    return "needs_review";
  }

  return draftData.title && draftData.description ? "draft" : "needs_info";
}

export async function updateProductDraftFromForm(
  productId: string,
  formData: FormData
): Promise<ProductUpdateResult> {
  const access = await requireWorkspaceAccess(productWriteRoles);
  const product = db
    .select({
      draftData: products.draftData,
      status: products.status
    })
    .from(products)
    .where(
      and(
        eq(products.id, productId),
        eq(products.workspaceId, access.workspaceId),
        isNull(products.deletedAt)
      )
    )
    .limit(1)
    .get();

  if (!product) {
    throw new Error("Product not found for this workspace.");
  }

  const draftData = buildDraftData(formData);
  const changedFieldCount = countChangedFields(product.draftData, draftData);
  const hasPriceParsingError = Boolean(draftData.parsing_notes?.length);
  let auditMarkedStaleCount = 0;

  if (changedFieldCount > 0) {
    db.transaction((tx) => {
      tx.update(products)
        .set({
          title: getProductTitle(draftData),
          subtitle: getStringField(draftData, "subtitle"),
          category: getStringField(draftData, "category"),
          description: getStringField(draftData, "description"),
          materials: getStringField(draftData, "materials"),
          dimensions: getStringField(draftData, "dimensions"),
          origin: getStringField(draftData, "origin"),
          currentPrice: getNumberField(draftData, "current_price"),
          desiredPrice: getNumberField(draftData, "desired_price"),
          costPrice: getNumberField(draftData, "cost_price"),
          targetMargin: getNumberField(draftData, "target_margin"),
          sku: getStringField(draftData, "sku"),
          imageUrl: getStringField(draftData, "image_url"),
          clientNotes: getStringField(draftData, "client_notes"),
          status: getProductStatus(product.status, draftData),
          draftData,
          updatedAt: sql`CURRENT_TIMESTAMP`
        })
        .where(
          and(
            eq(products.id, productId),
            eq(products.workspaceId, access.workspaceId),
            isNull(products.deletedAt)
          )
        )
        .run();

      const staleResult = tx.update(productAudits)
        .set({
          status: "stale",
          updatedAt: sql`CURRENT_TIMESTAMP`
        })
        .where(
          and(
            eq(productAudits.productId, productId),
            eq(productAudits.workspaceId, access.workspaceId),
            eq(productAudits.status, "current")
          )
        )
        .run();

      auditMarkedStaleCount = staleResult.changes;
    });

    logEvent({
      workspaceId: access.workspaceId,
      actorUserId: access.userId,
      action: "product.update",
      entityType: "product",
      entityId: productId,
      metadata: {
        product_id: productId,
        changed_field_count: changedFieldCount,
        audit_marked_stale_count: auditMarkedStaleCount
      }
    });
  }

  return {
    auditMarkedStaleCount,
    changedFieldCount,
    hasPriceParsingError,
    productId
  };
}

function getValidationAuditState(productId: string, workspaceId: string): {
  auditStatus: ProductValidationResult["auditStatus"];
  blockingCount: number;
} {
  const currentAudit = db
    .select({ id: productAudits.id })
    .from(productAudits)
    .where(
      and(
        eq(productAudits.productId, productId),
        eq(productAudits.workspaceId, workspaceId),
        eq(productAudits.status, "current")
      )
    )
    .limit(1)
    .get();

  if (currentAudit) {
    const blockingCount = db
      .select({ id: auditFindings.id })
      .from(auditFindings)
      .where(
        and(
          eq(auditFindings.auditId, currentAudit.id),
          eq(auditFindings.workspaceId, workspaceId),
          eq(auditFindings.severity, "blocking")
        )
      )
      .all().length;

    return {
      auditStatus: "current",
      blockingCount
    };
  }

  const staleAudit = db
    .select({ id: productAudits.id })
    .from(productAudits)
    .where(
      and(
        eq(productAudits.productId, productId),
        eq(productAudits.workspaceId, workspaceId),
        eq(productAudits.status, "stale")
      )
    )
    .limit(1)
    .get();

  return {
    auditStatus: staleAudit ? "stale" : "none",
    blockingCount: 0
  };
}

export async function validateProductDraft(
  productId: string
): Promise<ProductValidationResult> {
  const access = await requireWorkspaceAccess(productWriteRoles);
  const product = db
    .select({
      draftData: products.draftData
    })
    .from(products)
    .where(
      and(
        eq(products.id, productId),
        eq(products.workspaceId, access.workspaceId),
        isNull(products.deletedAt)
      )
    )
    .limit(1)
    .get();

  if (!product) {
    throw new Error("Product not found for this workspace.");
  }

  const auditState = getValidationAuditState(productId, access.workspaceId);

  if (auditState.auditStatus === "current" && auditState.blockingCount > 0) {
    logEvent({
      workspaceId: access.workspaceId,
      actorUserId: access.userId,
      action: "product.validation",
      entityType: "product",
      entityId: productId,
      metadata: {
        product_id: productId,
        validation_status: "blocked",
        audit_status: auditState.auditStatus,
        blocking_count: auditState.blockingCount
      }
    });

    throw new Error("Validation blocked by current audit findings.");
  }

  db.update(products)
    .set({
      status: "validated",
      validatedData: product.draftData,
      updatedAt: sql`CURRENT_TIMESTAMP`
    })
    .where(
      and(
        eq(products.id, productId),
        eq(products.workspaceId, access.workspaceId),
        isNull(products.deletedAt)
      )
    )
    .run();

  logEvent({
    workspaceId: access.workspaceId,
    actorUserId: access.userId,
    action: "product.validation",
    entityType: "product",
    entityId: productId,
    metadata: {
      product_id: productId,
      validation_status: "validated",
      audit_status: auditState.auditStatus,
      blocking_count: auditState.blockingCount
    }
  });

  return {
    auditStatus: auditState.auditStatus,
    blockingCount: auditState.blockingCount,
    productId,
    validationStatus: "validated"
  };
}

export async function updateProductDraftAction(
  formData: FormData
): Promise<void> {
  const productId = formData.get("productId");

  if (typeof productId !== "string" || productId.length === 0) {
    redirect("/catalog");
  }

  let result: ProductUpdateResult;

  try {
    result = await updateProductDraftFromForm(productId, formData);
  } catch (error) {
    const message = encodeURIComponent(
      error instanceof Error ? error.message : "Product update failed."
    );
    redirect(`/products/${encodeURIComponent(productId)}?error=${message}`);
  }

  const params = new URLSearchParams();

  if (result.changedFieldCount > 0) {
    params.set("saved", "1");
  }

  if (result.hasPriceParsingError) {
    params.set("price_error", "1");
  }

  const query = params.toString();
  redirect(`/products/${encodeURIComponent(productId)}${query ? `?${query}` : ""}`);
}

export async function validateProductDraftAction(
  formData: FormData
): Promise<void> {
  const productId = formData.get("productId");

  if (typeof productId !== "string" || productId.length === 0) {
    redirect("/catalog");
  }

  try {
    await validateProductDraft(productId);
  } catch (error) {
    const message = encodeURIComponent(
      error instanceof Error ? error.message : "Product validation failed."
    );
    redirect(`/products/${encodeURIComponent(productId)}?validation_error=${message}`);
  }

  redirect(`/products/${encodeURIComponent(productId)}?validated=1`);
}

export async function replaceProductImageAction(
  formData: FormData
): Promise<void> {
  const productId = formData.get("productId");
  const image = formData.get("image");

  if (typeof productId !== "string" || productId.length === 0) {
    redirect("/catalog");
  }

  if (!(image instanceof File) || image.size === 0) {
    redirect(
      `/products/${encodeURIComponent(
        productId
      )}?image_error=${encodeURIComponent("Sélectionnez une image.")}`
    );
  }

  try {
    await replaceProductImage(productId, image);
  } catch (error) {
    const message = encodeURIComponent(
      error instanceof Error ? error.message : "Ajout de l’image impossible."
    );
    redirect(`/products/${encodeURIComponent(productId)}?image_error=${message}`);
  }

  redirect(`/products/${encodeURIComponent(productId)}?image_saved=1`);
}

export async function removeProductImageAction(
  formData: FormData
): Promise<void> {
  const productId = formData.get("productId");

  if (typeof productId !== "string" || productId.length === 0) {
    redirect("/catalog");
  }

  try {
    await removeProductImage(productId);
  } catch (error) {
    const message = encodeURIComponent(
      error instanceof Error ? error.message : "Suppression de l’image impossible."
    );
    redirect(`/products/${encodeURIComponent(productId)}?image_error=${message}`);
  }

  redirect(`/products/${encodeURIComponent(productId)}?image_removed=1`);
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  const productId = formData.get("productId");
  const confirmation = formData.get("confirmation");

  if (
    typeof productId !== "string" ||
    productId.length === 0 ||
    typeof confirmation !== "string"
  ) {
    redirect("/catalog");
  }

  try {
    await deleteProductWithConfirmation({
      confirmation,
      productId
    });
  } catch (error) {
    const message = encodeURIComponent(
      error instanceof Error ? error.message : "Suppression de la fiche impossible."
    );
    redirect(`/products/${encodeURIComponent(productId)}?delete_error=${message}`);
  }

  redirect("/catalog?soft_deleted=1");
}

export async function restoreProductAction(formData: FormData): Promise<void> {
  const productId = formData.get("productId");

  if (typeof productId !== "string" || productId.length === 0) {
    redirect("/catalog?deleted=deleted");
  }

  try {
    await restoreDeletedProduct(productId);
  } catch (error) {
    const message = encodeURIComponent(
      error instanceof Error ? error.message : "Restauration impossible."
    );
    redirect(`/products/${encodeURIComponent(productId)}?restore_error=${message}`);
  }

  redirect(`/products/${encodeURIComponent(productId)}?restored=1`);
}
