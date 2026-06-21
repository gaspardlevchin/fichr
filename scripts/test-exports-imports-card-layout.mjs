import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const importsPage = await readFile("src/app/imports/page.tsx", "utf8");
const exportsPage = await readFile("src/app/exports/page.tsx", "utf8");
const styles = await readFile("src/styles/globals.css", "utf8");

for (const className of [
  "import-history-filename",
  "import-history-count",
  "import-history-action"
]) {
  assert.equal(importsPage.includes(className), true);
}
for (const className of ["export-history-code", "export-history-meta"]) {
  assert.equal(exportsPage.includes(className), true);
  assert.equal(styles.includes(`.${className}`), true);
}
assert.equal(importsPage.includes("<time dateTime={importItem.createdAt}>"), true);
assert.equal(styles.includes("font-size: 0.88rem"), true);
assert.equal(styles.includes("font-size: 0.86rem"), true);
assert.equal(styles.includes("padding: 13px 16px"), true);

console.log("Exports and imports card layout coverage passed.");
