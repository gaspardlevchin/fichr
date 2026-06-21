import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { resolveExportProductSelection } from "../src/server/exports/core.ts";

const products = [
  {
    category: null,
    deletedAt: null,
    id: "validated",
    sku: null,
    status: "validated",
    title: "Validé",
    validatedData: { title: "Snapshot validé" }
  },
  {
    category: null,
    deletedAt: null,
    id: "draft",
    sku: null,
    status: "draft",
    title: "Brouillon",
    validatedData: { title: "Ne jamais exporter" }
  },
  {
    category: null,
    deletedAt: "2026-06-20T10:00:00.000Z",
    id: "deleted",
    sku: null,
    status: "validated",
    title: "Supprimé",
    validatedData: { title: "Ne jamais exporter" }
  }
];
const selection = resolveExportProductSelection(products);
const page = await readFile("src/app/products/[productId]/page.tsx", "utf8");

assert.deepEqual(selection.exportProducts.map((product) => product.id), [
  "validated"
]);
assert.equal(selection.skippedProductCount, 2);
assert.equal(
  page.includes(
    'const exportable = product.status === "validated" && !product.deletedAt'
  ),
  true
);
assert.equal(page.includes("Export verrouillé"), true);
assert.equal(page.includes("Non exportable"), true);
assert.equal(page.includes("validatedData ="), false);

console.log("Product export eligibility UI coverage passed.");
