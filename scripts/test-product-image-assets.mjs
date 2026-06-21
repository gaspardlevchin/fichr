import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  PRODUCT_IMAGE_MAX_BYTES,
  createProductImageFilename,
  deleteProductImageAsset,
  getControlledProductImageFilename,
  getProductImageStoragePath,
  readProductImageAsset,
  saveProductImageAsset,
  validateProductImageUpload
} from "../src/server/products/image-assets.ts";
import { applyProductImageDraftChange } from "../src/server/products/product-mutation-core.ts";
import {
  analyzeProductCompleteness,
  getProductCompletenessQuickActionTargetId
} from "../src/lib/product-completeness.ts";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00
]);
const webp = Buffer.from("RIFF0000WEBPVP8 ", "ascii");

function validate(filename, mimeType, content) {
  return validateProductImageUpload({
    content,
    filename,
    mimeType,
    size: content.byteLength
  });
}

function expectRefused(filename, mimeType, content, pattern) {
  assert.throws(() => validate(filename, mimeType, content), pattern);
}

function createProductWithoutImage() {
  return {
    category: "Décoration",
    clientNotes: null,
    costPrice: 40,
    currentPrice: 100,
    description:
      "Description produit suffisamment complète pour vérifier la navigation média.",
    desiredPrice: 120,
    dimensions: "20 x 30 cm",
    draftData: {
      title: "Vase local",
      subtitle: "Pièce atelier",
      category: "Décoration",
      description:
        "Description produit suffisamment complète pour vérifier la navigation média.",
      materials: "Céramique",
      dimensions: "20 x 30 cm",
      origin: "France",
      current_price: 100,
      desired_price: 120,
      cost_price: 40,
      sku: "VAS-LOCAL",
      image_url: null
    },
    imageUrl: null,
    materials: "Céramique",
    origin: "France",
    sku: "VAS-LOCAL",
    status: "draft",
    subtitle: "Pièce atelier",
    targetMargin: null,
    title: "Vase local",
    validatedData: null
  };
}

async function main() {
  process.env.AI_ENABLED = "false";
  globalThis.fetch = () => {
    throw new Error("OpenAI must not be called by product image assets.");
  };

  assert.equal(validate("photo.jpg", "image/jpeg", jpeg).extension, "jpg");
  assert.equal(validate("photo.jpeg", "image/jpeg", jpeg).extension, "jpg");
  assert.equal(validate("photo.png", "image/png", png).extension, "png");
  assert.equal(validate("photo.webp", "image/webp", webp).extension, "webp");

  expectRefused("photo.svg", "image/svg+xml", Buffer.from("<svg/>"), /refusé/);
  expectRefused("photo.gif", "image/gif", Buffer.from("GIF89a"), /refusé/);
  expectRefused("photo.pdf", "application/pdf", Buffer.from("%PDF"), /refusé/);
  expectRefused("photo.heic", "image/heic", Buffer.from("heic"), /refusé/);
  expectRefused(
    "photo.jpg",
    "image/jpeg",
    Buffer.alloc(PRODUCT_IMAGE_MAX_BYTES + 1, 0xff),
    /5 Mo/
  );
  expectRefused("photo.jpg", "image/jpeg", Buffer.alloc(0), /vide/);
  expectRefused("../photo.jpg", "image/jpeg", jpeg, /Nom de fichier/);
  expectRefused("photo.png", "image/jpeg", jpeg, /extension/);
  expectRefused("photo.jpg", "image/jpeg", png, /format annoncé/);

  const generatedFilename = createProductImageFilename(
    "img_generated_safe",
    "jpg"
  );
  assert.equal(generatedFilename, "img_generated_safe.jpg");
  assert.equal(generatedFilename.includes("photo"), false);
  assert.throws(
    () => createProductImageFilename("../escape", "jpg"),
    /Identifiant image/
  );
  assert.throws(
    () =>
      getProductImageStoragePath({
        filename: "img_safe.jpg",
        productId: "../outside",
        workspaceId: "wks_test"
      }),
    /Identifiant produit/
  );

  const tempDir = await mkdtemp(path.join(tmpdir(), "fichr-product-images-"));

  try {
    const saved = await saveProductImageAsset({
      assetId: "img_test_asset",
      content: jpeg,
      extension: "jpg",
      productId: "prd_image_test",
      storageRoot: tempDir,
      workspaceId: "wks_image_test"
    });
    assert.equal(
      saved.imageUrl,
      "/products/prd_image_test/image?asset=img_test_asset.jpg"
    );
    assert.equal(
      getControlledProductImageFilename(
        saved.imageUrl,
        "prd_image_test"
      ),
      "img_test_asset.jpg"
    );
    assert.equal(
      getControlledProductImageFilename(
        "https://example.com/external.jpg",
        "prd_image_test"
      ),
      null
    );

    const storedPath = getProductImageStoragePath({
      filename: saved.filename,
      productId: "prd_image_test",
      storageRoot: tempDir,
      workspaceId: "wks_image_test"
    });
    assert.equal((await readFile(storedPath)).equals(jpeg), true);

    const download = await readProductImageAsset({
      imageUrl: saved.imageUrl,
      productId: "prd_image_test",
      storageRoot: tempDir,
      workspaceId: "wks_image_test"
    });
    assert.equal(download.mimeType, "image/jpeg");
    assert.equal(download.content.equals(jpeg), true);

    const validatedData = {
      title: "Snapshot validé",
      image_url: "https://example.com/validated.jpg"
    };
    const validatedSnapshot = JSON.stringify(validatedData);
    const added = applyProductImageDraftChange({
      currentStatus: "validated",
      draftData: {
        title: "Produit",
        image_url: null
      },
      imageUrl: saved.imageUrl
    });
    assert.equal(added.draftData.image_url, saved.imageUrl);
    assert.equal(added.status, "needs_review");
    assert.equal(JSON.stringify(validatedData), validatedSnapshot);

    const removed = applyProductImageDraftChange({
      currentStatus: added.status,
      draftData: added.draftData,
      imageUrl: null
    });
    assert.equal(removed.draftData.image_url, null);
    assert.equal(JSON.stringify(validatedData), validatedSnapshot);

    const completeness = analyzeProductCompleteness(createProductWithoutImage());
    const imageAction = completeness.quickActions.find(
      (action) => action.id === "add-image"
    );
    assert.equal(
      imageAction
        ? getProductCompletenessQuickActionTargetId(imageAction)
        : null,
      "product-media"
    );

    assert.equal(
      await deleteProductImageAsset({
        imageUrl: "https://example.com/external.jpg",
        productId: "prd_image_test",
        storageRoot: tempDir,
        workspaceId: "wks_image_test"
      }),
      false
    );
    assert.equal(
      await deleteProductImageAsset({
        imageUrl: saved.imageUrl,
        productId: "prd_image_test",
        storageRoot: tempDir,
        workspaceId: "wks_image_test"
      }),
      true
    );
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }

  const catalogSource = await readFile(
    "src/components/catalog/catalog-bulk-export-form.tsx",
    "utf8"
  );
  const uploadSource = await readFile(
    "src/components/product/product-image-upload.tsx",
    "utf8"
  );
  assert.equal(catalogSource.includes("Aucune image"), true);
  assert.equal(catalogSource.includes("product.imageUrl"), true);
  assert.equal(uploadSource.includes('type="file"'), true);
  assert.equal(uploadSource.includes("media-file-input"), true);
  assert.equal(uploadSource.includes("Aucun fichier sélectionné"), true);
  assert.equal(uploadSource.includes("replaceProductImageAction"), true);

  console.log("Product image asset coverage passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
