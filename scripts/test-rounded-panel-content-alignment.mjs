import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const styles = await readFile("src/styles/globals.css", "utf8");
const sources = await Promise.all(
  [
    "src/components/import/import-dropzone.tsx",
    "src/app/imports/page.tsx",
    "src/app/catalog/page.tsx",
    "src/app/exports/page.tsx",
    "src/app/account/page.tsx",
    "src/app/products/[productId]/page.tsx"
  ].map((path) => readFile(path, "utf8"))
);

assert.equal(styles.includes(".content-card"), true);
assert.equal(styles.includes(".content-card-inner"), true);
assert.equal(styles.includes("padding: 24px var(--card-inset)"), true);

for (const source of sources) {
  assert.equal(source.includes("content-card"), true);
  assert.equal(source.includes("content-card-inner"), true);
}

console.log("Rounded panel content alignment coverage passed.");
