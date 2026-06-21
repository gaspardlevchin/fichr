import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const product = await readFile("src/app/products/[productId]/page.tsx", "utf8");
const styles = await readFile("src/styles/globals.css", "utf8");

for (const className of [
  "product-core-layout",
  "product-media-panel",
  "product-overview-panel",
  "product-overview-facts",
  "product-overview-details",
  "product-missing-summary",
  "product-batch-return"
]) {
  assert.equal(product.includes(className), true);
  assert.equal(styles.includes(`.${className}`), true);
}

assert.equal(product.includes("{navigation.position} sur {navigation.total}"), true);
assert.equal(product.includes("Retour au lot"), true);
assert.equal(product.includes("content-card-inner"), true);
assert.equal(
  product.includes(
    'const exportable = product.status === "validated" && !product.deletedAt'
  ),
  true
);
assert.equal(product.includes("validatedData ="), false);

console.log("Product detail layout rebuild coverage passed.");
