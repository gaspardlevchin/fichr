import { and, eq, isNull, sql } from "drizzle-orm";

import { productAudits, products } from "../../../db/schema";
import { logEvent } from "@/server/audit/event-log";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { db } from "@/server/db/client";
import {
  assertFeatureAllowed,
  assertQuotaAvailable
} from "@/server/entitlements/service";
import { createServerId } from "@/server/ids";
import {
  deleteProductImageAsset,
  getControlledProductImageFilename,
  getProductImageStorageKey,
  readProductImageAsset,
  saveProductImageAsset,
  validateProductImageUpload,
  type ProductImageMimeType
} from "@/server/products/image-assets";
import { applyProductImageDraftChange } from "@/server/products/product-mutation-core";
import {
  markStorageObjectDeleted,
  recordStorageObject
} from "@/server/storage/manifest";

const productReadRoles = ["owner", "admin", "editor", "viewer"] as const;
const productWriteRoles = ["owner", "admin", "editor"] as const;

type ProductImageFile = {
  arrayBuffer(): Promise<ArrayBuffer>;
  name: string;
  size: number;
  type: string;
};

type ProductImageMutationResult = {
  auditMarkedStaleCount: number;
  deletedPreviousFile: boolean;
  imageUrl: string | null;
  productId: string;
};

async function deleteProductImageAssetBestEffort(input: {
  imageUrl: string | null;
  productId: string;
  workspaceId: string;
}): Promise<boolean> {
  try {
    const deleted = await deleteProductImageAsset(input);
    const filename = getControlledProductImageFilename(
      input.imageUrl,
      input.productId
    );

    if (filename) {
      markStorageObjectDeleted({
        storageKey: getProductImageStorageKey({
          filename,
          productId: input.productId,
          workspaceId: input.workspaceId
        }),
        workspaceId: input.workspaceId
      });
    }

    return deleted;
  } catch {
    return false;
  }
}

async function updateProductImage(input: {
  imageUrl: string | null;
  productId: string;
}): Promise<{
  auditMarkedStaleCount: number;
  previousImageUrl: string | null;
  workspaceId: string;
  userId: string;
}> {
  const access = await requireWorkspaceAccess(productWriteRoles);
  const product = db
    .select({
      draftData: products.draftData,
      imageUrl: products.imageUrl,
      status: products.status
    })
    .from(products)
    .where(
      and(
        eq(products.id, input.productId),
        eq(products.workspaceId, access.workspaceId),
        isNull(products.deletedAt)
      )
    )
    .limit(1)
    .get();

  if (!product) {
    throw new Error("Fiche produit introuvable pour ce workspace.");
  }

  const mutation = applyProductImageDraftChange({
    currentStatus: product.status,
    draftData: product.draftData,
    imageUrl: input.imageUrl
  });
  let auditMarkedStaleCount = 0;

  db.transaction((tx) => {
    tx.update(products)
      .set({
        draftData: mutation.draftData,
        imageUrl: input.imageUrl,
        status: mutation.status,
        updatedAt: sql`CURRENT_TIMESTAMP`
      })
      .where(
        and(
          eq(products.id, input.productId),
          eq(products.workspaceId, access.workspaceId),
          isNull(products.deletedAt)
        )
      )
      .run();

    const staleResult = tx
      .update(productAudits)
      .set({
        status: "stale",
        updatedAt: sql`CURRENT_TIMESTAMP`
      })
      .where(
        and(
          eq(productAudits.productId, input.productId),
          eq(productAudits.workspaceId, access.workspaceId),
          eq(productAudits.status, "current")
        )
      )
      .run();

    auditMarkedStaleCount = staleResult.changes;
  });

  return {
    auditMarkedStaleCount,
    previousImageUrl: product.imageUrl,
    userId: access.userId,
    workspaceId: access.workspaceId
  };
}

export async function replaceProductImage(
  productId: string,
  file: ProductImageFile
): Promise<ProductImageMutationResult> {
  const content = Buffer.from(await file.arrayBuffer());
  const validation = validateProductImageUpload({
    content,
    filename: file.name,
    mimeType: file.type,
    size: file.size
  });
  const access = await requireWorkspaceAccess(productWriteRoles);
  assertFeatureAllowed(access.workspaceId, "upload_product_image");
  const existingProduct = db
    .select({ imageUrl: products.imageUrl })
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

  if (!existingProduct) {
    throw new Error("Fiche produit introuvable pour ce workspace.");
  }

  if (!existingProduct.imageUrl) {
    assertQuotaAvailable(access.workspaceId, "maxImages");
  }

  const savedImage = await saveProductImageAsset({
    assetId: createServerId("img"),
    content,
    extension: validation.extension,
    productId,
    workspaceId: access.workspaceId
  });
  try {
    recordStorageObject({
      filename: savedImage.filename,
      hashSha256: savedImage.hashSha256,
      mimeType: validation.mimeType,
      objectType: "product_image",
      sizeBytes: savedImage.sizeBytes,
      storageKey: savedImage.storageKey,
      workspaceId: access.workspaceId
    });
  } catch (error) {
    await deleteProductImageAssetBestEffort({
      imageUrl: savedImage.imageUrl,
      productId,
      workspaceId: access.workspaceId
    });
    throw error;
  }

  let mutation:
    | Awaited<ReturnType<typeof updateProductImage>>
    | undefined;

  try {
    mutation = await updateProductImage({
      imageUrl: savedImage.imageUrl,
      productId
    });
  } catch (error) {
    await deleteProductImageAssetBestEffort({
      imageUrl: savedImage.imageUrl,
      productId,
      workspaceId: access.workspaceId
    });
    throw error;
  }

  const deletedPreviousFile = await deleteProductImageAssetBestEffort({
    imageUrl: mutation.previousImageUrl,
    productId,
    workspaceId: mutation.workspaceId
  });

  logEvent({
    workspaceId: mutation.workspaceId,
    actorUserId: mutation.userId,
    action: "product.image.update",
    entityType: "product",
    entityId: productId,
    metadata: {
      product_id: productId,
      status: "attached",
      changed_field_count: 1,
      audit_marked_stale_count: mutation.auditMarkedStaleCount,
      deleted_file: deletedPreviousFile
    }
  });

  return {
    auditMarkedStaleCount: mutation.auditMarkedStaleCount,
    deletedPreviousFile,
    imageUrl: savedImage.imageUrl,
    productId
  };
}

export async function removeProductImage(
  productId: string
): Promise<ProductImageMutationResult> {
  const mutation = await updateProductImage({
    imageUrl: null,
    productId
  });
  const deletedPreviousFile = await deleteProductImageAssetBestEffort({
    imageUrl: mutation.previousImageUrl,
    productId,
    workspaceId: mutation.workspaceId
  });

  logEvent({
    workspaceId: mutation.workspaceId,
    actorUserId: mutation.userId,
    action: "product.image.remove",
    entityType: "product",
    entityId: productId,
    metadata: {
      product_id: productId,
      status: "removed",
      changed_field_count: mutation.previousImageUrl ? 1 : 0,
      audit_marked_stale_count: mutation.auditMarkedStaleCount,
      deleted_file: deletedPreviousFile
    }
  });

  return {
    auditMarkedStaleCount: mutation.auditMarkedStaleCount,
    deletedPreviousFile,
    imageUrl: null,
    productId
  };
}

export async function getProductImageDownload(productId: string): Promise<{
  content: Buffer;
  mimeType: ProductImageMimeType;
}> {
  const access = await requireWorkspaceAccess(productReadRoles);
  const product = db
    .select({ imageUrl: products.imageUrl })
    .from(products)
    .where(
      and(
        eq(products.id, productId),
        eq(products.workspaceId, access.workspaceId)
      )
    )
    .limit(1)
    .get();

  if (!product?.imageUrl) {
    throw new Error("Image produit introuvable.");
  }

  return readProductImageAsset({
    imageUrl: product.imageUrl,
    productId,
    workspaceId: access.workspaceId
  });
}
