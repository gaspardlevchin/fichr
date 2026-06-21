import path from "node:path";

import {
  createWorkspaceStorageKey,
  resolveWorkspaceStoragePath
} from "../storage/path-safety.ts";
import {
  createLocalStorageProvider,
  getLocalStorageRoot
} from "../storage/providers/local.ts";

export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const productImageMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp"
] as const;

export type ProductImageMimeType = (typeof productImageMimeTypes)[number];
export type ProductImageExtension = "jpg" | "png" | "webp";

type ProductImageUploadInput = {
  content: Buffer;
  filename: string;
  mimeType: string;
  size: number;
};

type ProductImageStorageInput = {
  assetId: string;
  content: Buffer;
  extension: ProductImageExtension;
  productId: string;
  storageRoot?: string;
  workspaceId: string;
};

const extensionByMimeType: Record<
  ProductImageMimeType,
  readonly string[]
> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"]
};

const storedExtensionByMimeType: Record<
  ProductImageMimeType,
  ProductImageExtension
> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

function assertSafeStorageSegment(value: string, label: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error(`${label} invalide pour le stockage local.`);
  }

  return value;
}

function hasJpegSignature(content: Buffer): boolean {
  return (
    content.length >= 3 &&
    content[0] === 0xff &&
    content[1] === 0xd8 &&
    content[2] === 0xff
  );
}

function hasPngSignature(content: Buffer): boolean {
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  return (
    content.length >= pngSignature.length &&
    pngSignature.every((byte, index) => content[index] === byte)
  );
}

function hasWebpSignature(content: Buffer): boolean {
  return (
    content.length >= 12 &&
    content.subarray(0, 4).toString("ascii") === "RIFF" &&
    content.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

function hasExpectedSignature(
  content: Buffer,
  mimeType: ProductImageMimeType
): boolean {
  if (mimeType === "image/jpeg") {
    return hasJpegSignature(content);
  }

  if (mimeType === "image/png") {
    return hasPngSignature(content);
  }

  return hasWebpSignature(content);
}

export function validateProductImageUpload(
  input: ProductImageUploadInput
): {
  extension: ProductImageExtension;
  mimeType: ProductImageMimeType;
} {
  if (
    !input.filename ||
    input.filename.length > 255 ||
    input.filename.includes("\0") ||
    input.filename.includes("/") ||
    input.filename.includes("\\") ||
    input.filename.includes("..")
  ) {
    throw new Error("Nom de fichier image invalide.");
  }

  if (input.size <= 0 || input.content.byteLength <= 0) {
    throw new Error("Le fichier image est vide.");
  }

  if (
    input.size > PRODUCT_IMAGE_MAX_BYTES ||
    input.content.byteLength > PRODUCT_IMAGE_MAX_BYTES
  ) {
    throw new Error("L’image dépasse la limite de 5 Mo.");
  }

  if (input.size !== input.content.byteLength) {
    throw new Error("La taille du fichier image est incohérente.");
  }

  if (!productImageMimeTypes.includes(input.mimeType as ProductImageMimeType)) {
    throw new Error("Format image refusé. Utilisez JPG, PNG ou WEBP.");
  }

  const mimeType = input.mimeType as ProductImageMimeType;
  const extension = path.extname(input.filename).toLowerCase();

  if (!extensionByMimeType[mimeType].includes(extension)) {
    throw new Error("L’extension ne correspond pas au type de l’image.");
  }

  if (!hasExpectedSignature(input.content, mimeType)) {
    throw new Error("Le contenu du fichier ne correspond pas au format annoncé.");
  }

  return {
    extension: storedExtensionByMimeType[mimeType],
    mimeType
  };
}

export function createProductImageFilename(
  assetId: string,
  extension: ProductImageExtension
): string {
  const safeAssetId = assertSafeStorageSegment(assetId, "Identifiant image");
  return `${safeAssetId}.${extension}`;
}

export function createProductImageReference(input: {
  filename: string;
  productId: string;
}): string {
  const safeProductId = assertSafeStorageSegment(
    input.productId,
    "Identifiant produit"
  );

  if (!/^[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(input.filename)) {
    throw new Error("Nom d’asset image invalide.");
  }

  return `/products/${encodeURIComponent(
    safeProductId
  )}/image?asset=${encodeURIComponent(input.filename)}`;
}

export function getControlledProductImageFilename(
  imageUrl: string | null,
  productId: string
): string | null {
  if (!imageUrl?.startsWith("/") || imageUrl.startsWith("//")) {
    return null;
  }

  const url = new URL(imageUrl, "http://fichr.local");
  const expectedPath = `/products/${encodeURIComponent(productId)}/image`;
  const filename = url.searchParams.get("asset");

  if (
    url.pathname !== expectedPath ||
    !filename ||
    !/^[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(filename)
  ) {
    return null;
  }

  return filename;
}

export function getProductImageStoragePath(input: {
  filename: string;
  productId: string;
  storageRoot?: string;
  workspaceId: string;
}): string {
  const storageKey = getProductImageStorageKey(input);

  return resolveWorkspaceStoragePath({
    storageKey,
    storageRoot: getLocalStorageRoot(input.storageRoot),
    workspaceId: input.workspaceId
  });
}

export function getProductImageStorageKey(input: {
  filename: string;
  productId: string;
  workspaceId: string;
}): string {
  const productId = assertSafeStorageSegment(
    input.productId,
    "Identifiant produit"
  );

  if (!/^[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(input.filename)) {
    throw new Error("Nom d’asset image invalide.");
  }

  return createWorkspaceStorageKey({
    namespace: "images",
    relativeKey: `${productId}/${input.filename}`,
    workspaceId: input.workspaceId
  });
}

export async function saveProductImageAsset(
  input: ProductImageStorageInput
): Promise<{
  filename: string;
  hashSha256: string;
  imageUrl: string;
  sizeBytes: number;
  storageKey: string;
}> {
  const filename = createProductImageFilename(input.assetId, input.extension);
  const storageKey = getProductImageStorageKey({
    filename,
    productId: input.productId,
    workspaceId: input.workspaceId
  });
  const metadata = await createLocalStorageProvider(input.storageRoot).writeFile({
    content: input.content,
    mimeType:
      input.extension === "png"
        ? "image/png"
        : input.extension === "webp"
          ? "image/webp"
          : "image/jpeg",
    storageKey,
    workspaceId: input.workspaceId
  });

  return {
    filename,
    hashSha256: metadata.hashSha256,
    imageUrl: createProductImageReference({
      filename,
      productId: input.productId
    }),
    sizeBytes: metadata.sizeBytes,
    storageKey
  };
}

export async function readProductImageAsset(input: {
  imageUrl: string;
  productId: string;
  storageRoot?: string;
  workspaceId: string;
}): Promise<{ content: Buffer; mimeType: ProductImageMimeType }> {
  const filename = getControlledProductImageFilename(
    input.imageUrl,
    input.productId
  );

  if (!filename) {
    throw new Error("Image locale introuvable.");
  }

  const storageKey = getProductImageStorageKey({
    filename,
    productId: input.productId,
    workspaceId: input.workspaceId
  });
  const extension = path.extname(filename).toLowerCase();
  const mimeType: ProductImageMimeType =
    extension === ".png"
      ? "image/png"
      : extension === ".webp"
        ? "image/webp"
        : "image/jpeg";

  return {
    content: await createLocalStorageProvider(input.storageRoot).readFile({
      storageKey,
      workspaceId: input.workspaceId
    }),
    mimeType
  };
}

export async function deleteProductImageAsset(input: {
  imageUrl: string | null;
  productId: string;
  storageRoot?: string;
  workspaceId: string;
}): Promise<boolean> {
  const filename = getControlledProductImageFilename(
    input.imageUrl,
    input.productId
  );

  if (!filename) {
    return false;
  }

  const storageKey = getProductImageStorageKey({
    filename,
    productId: input.productId,
    workspaceId: input.workspaceId
  });

  return createLocalStorageProvider(input.storageRoot).deleteFile({
    storageKey,
    workspaceId: input.workspaceId
  });
}
