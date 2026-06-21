import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile("src/app/products/[productId]/page.tsx", "utf8");
const styles = await readFile("src/styles/globals.css", "utf8");

for (const className of [
  "product-batch-navigation",
  "product-batch-link",
  "product-batch-position",
  "product-batch-edge"
]) {
  assert.equal(page.includes(className), true);
  assert.equal(styles.includes(`.${className}`), true);
}
assert.equal(page.includes("{navigation.position} sur {navigation.total}"), true);
assert.equal(page.includes("Retour au lot"), true);
assert.equal(styles.includes("font-size: 0.76rem"), true);
assert.equal(styles.includes("min-height: 38px"), true);

console.log("Product batch navigation UI coverage passed.");
