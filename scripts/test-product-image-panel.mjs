import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const product = await readFile("src/app/products/[productId]/page.tsx", "utf8");
const upload = await readFile(
  "src/components/product/product-image-upload.tsx",
  "utf8"
);
const styles = await readFile("src/styles/globals.css", "utf8");
const actionBlock = styles.match(/\.product-media-actions \{[^}]+\}/)?.[0] ?? "";

assert.equal(product.includes("product-media-panel"), true);
assert.equal(product.includes("product-media-image"), true);
assert.equal(product.includes("product-media-layout"), true);
assert.equal(product.includes("product-media-placeholder"), true);
assert.equal(product.includes("Remplacez l’image ou retirez-la"), true);
assert.equal(product.includes("removeProductImageAction"), true);
assert.equal(upload.includes("replaceProductImageAction"), true);
assert.equal(upload.includes("Enregistrer l’image"), true);
assert.equal(actionBlock.includes("box-shadow"), false);
assert.equal(actionBlock.includes("border-radius"), false);
assert.equal(styles.includes(".product-media-empty-content"), false);
assert.equal(styles.includes(".product-media-with-image"), false);
assert.equal(
  styles.includes(
    "grid-template-columns: minmax(270px, 0.68fr) minmax(0, 1.32fr)"
  ),
  true
);
assert.equal(product.includes("product-core-layout"), true);
assert.equal(product.includes("content-card-inner"), true);

console.log("Product image panel coverage passed.");
