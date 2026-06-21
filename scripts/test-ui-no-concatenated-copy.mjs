import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "src/components/app-header.tsx",
  "src/app/catalog/page.tsx",
  "src/app/imports/page.tsx",
  "src/app/exports/page.tsx",
  "src/app/account/page.tsx",
  "src/app/products/[productId]/page.tsx"
];
const source = (
  await Promise.all(paths.map((path) => readFile(path, "utf8")))
).join("\n");

for (const gluedCopy of [
  "CompteRéglagesEspaces",
  "StudioActif",
  "60Produits",
  "0Brouillons",
  "Précédent17",
  "CSVGérer",
  "plansOuvrir",
  "Étape 1Fichier"
]) {
  assert.equal(source.includes(gluedCopy), false, `${gluedCopy} must not exist`);
}

assert.equal(source.includes("catalog-metric-value"), true);
assert.equal(source.includes("catalog-metric-label"), true);
assert.equal(source.includes("product-batch-position"), true);
assert.equal(source.includes("<time dateTime={importItem.createdAt}>"), true);

console.log("UI concatenated copy coverage passed.");
