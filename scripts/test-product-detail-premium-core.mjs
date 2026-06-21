import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile("src/app/products/[productId]/page.tsx", "utf8");
const styles = await readFile("src/styles/globals.css", "utf8");

const orderedSections = [
  "<ProductBatchNavigationBar",
  "<ProductMediaPanel",
  "<ProductOverviewPanel",
  "<ProductCompletenessPanel",
  'id={productCompletenessSectionTargetIds.edition}',
  "<ProductAuditPanel",
  "<ProductImportOriginPanel",
  "<ProductValidationPanel",
  "<ProductExportEligibilityPanel",
  "<ProductDangerPanel"
];
let previousIndex = -1;
for (const section of orderedSections) {
  const index = page.lastIndexOf(section);
  assert.ok(index > previousIndex, `${section} must keep the product workflow order`);
  previousIndex = index;
}

for (const label of [
  "Informations produit",
  "À compléter",
  "Contrôle déterministe",
  "Origine de la fiche",
  "Validation client"
]) {
  assert.equal(page.includes(label), true);
}
assert.equal(page.includes("product-overview-facts"), true);
assert.equal(page.includes("product-overview-details"), true);
assert.equal(page.includes("<details className=\"product-draft-details\">"), true);
assert.equal(styles.includes(".product-overview-panel"), true);

console.log("Product detail premium core coverage passed.");
