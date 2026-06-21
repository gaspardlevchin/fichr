import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const catalog = await readFile("src/app/catalog/page.tsx", "utf8");
const styles = await readFile("src/styles/globals.css", "utf8");

for (const className of [
  "catalog-metrics",
  "catalog-metrics-grid",
  "catalog-metric",
  "catalog-metric-value",
  "catalog-metric-label"
]) {
  assert.equal(catalog.includes(className), true);
  assert.equal(styles.includes(`.${className}`), true);
}

assert.equal(catalog.includes("catalog-summary-strip"), false);
assert.equal(
  styles.includes("grid-template-columns: repeat(6, minmax(0, 1fr))"),
  true
);
assert.equal(catalog.includes("catalog-metric-secondary"), true);

console.log("Catalog metrics layout coverage passed.");
