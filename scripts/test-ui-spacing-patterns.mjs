import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const styles = await readFile("src/styles/globals.css", "utf8");

for (const selector of [
  ".catalog-filter-groups",
  ".usage-limit-grid",
  ".usage-limit",
  ".product-media-actions",
  ".plan-capabilities"
]) {
  assert.equal(styles.includes(selector), true, `${selector} should exist`);
}

assert.equal(styles.includes("grid-template-columns: repeat(2, minmax(0, 1fr))"), true);
assert.equal(styles.includes("font-family: inherit"), true);
assert.equal(styles.includes(".content-card-inner"), true);
assert.equal(styles.includes("padding: 24px var(--card-inset)"), true);
assert.equal(styles.includes(".product-media-layout"), true);

console.log("UI spacing pattern coverage passed.");
