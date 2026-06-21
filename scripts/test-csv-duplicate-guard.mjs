import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { validateCsvImport } from "../src/server/imports/validation.ts";
import { markPotentialCatalogDuplicates } from "../src/server/products/catalog-filters.ts";

const duplicateSku = validateCsvImport(
  "sku,nom,espace,prix\nREF-1,Vase,Salon,20\nREF-1,Vase bis,Bureau,25"
);
const duplicateTitleSpace = validateCsvImport(
  "nom,espace,prix\nVase,Salon,20\nVase,Salon,25"
);
const service = await readFile("src/server/imports/service.ts", "utf8");
const importProducts = await readFile(
  "src/server/products/import-products.ts",
  "utf8"
);

assert.equal(duplicateSku.summary.skippedRows, 1);
assert.equal(duplicateTitleSpace.summary.skippedRows, 1);
assert.equal(
  duplicateSku.rows.some((row) => row.errorMessage?.includes("Ligne en double")),
  true
);

const marked = markPotentialCatalogDuplicates([
  {
    deletedAt: null,
    id: "prd_1",
    potentialDuplicate: false,
    sku: "REF-1",
    spaceId: null,
    title: "Vase"
  },
  {
    deletedAt: null,
    id: "prd_2",
    potentialDuplicate: false,
    sku: "ref-1",
    spaceId: "spc_1",
    title: "Autre"
  }
]);

assert.equal(marked.every((product) => product.potentialDuplicate), true);
assert.equal(service.includes('createHash("sha256")'), true);
assert.equal(service.includes("Un import similaire existe déjà"), true);
assert.equal(importProducts.includes("importRowId"), true);
assert.equal(importProducts.includes('status: "processed"'), true);
assert.equal(importProducts.includes(".delete(products)"), false);

console.log("CSV duplicate guard coverage passed.");
