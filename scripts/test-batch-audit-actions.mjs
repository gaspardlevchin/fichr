import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { planImportBatchAudit } from "../src/server/products/import-batch-core.ts";

const products = [
  {
    createdAt: "2026-06-19T10:00:00.000Z",
    deletedAt: null,
    id: "prd_a_active",
    importId: "imp_a",
    rowIndex: 1,
    title: "Produit A",
    workspaceId: "wks_a"
  },
  {
    createdAt: "2026-06-19T10:01:00.000Z",
    deletedAt: "2026-06-19T11:00:00.000Z",
    id: "prd_a_deleted",
    importId: "imp_a",
    rowIndex: 2,
    title: "Produit supprimé",
    workspaceId: "wks_a"
  },
  {
    createdAt: "2026-06-19T10:02:00.000Z",
    deletedAt: null,
    id: "prd_b",
    importId: "imp_b",
    rowIndex: 1,
    title: "Produit B",
    workspaceId: "wks_a"
  },
  {
    createdAt: "2026-06-19T10:03:00.000Z",
    deletedAt: null,
    id: "prd_other_workspace",
    importId: "imp_a",
    rowIndex: 3,
    title: "Autre workspace",
    workspaceId: "wks_b"
  }
];

const snapshots = JSON.stringify(products);
const plan = planImportBatchAudit(products, {
  importId: "imp_a",
  workspaceId: "wks_a"
});
assert.deepEqual(plan.productIds, ["prd_a_active"]);
assert.equal(plan.skippedDeletedCount, 1);
assert.equal(JSON.stringify(products), snapshots);

const serviceSource = await readFile(
  "src/server/products/import-batch.ts",
  "utf8"
);
const actionSource = await readFile(
  "src/server/products/import-batch-actions.ts",
  "utf8"
);
const pageSource = await readFile("src/app/catalog/page.tsx", "utf8");
const combinedSource = `${serviceSource}\n${actionSource}\n${pageSource}`;

assert.match(serviceSource, /runDeterministicProductAudit\(productId\)/);
assert.match(serviceSource, /eq\(products\.importId, importId\)/);
assert.match(serviceSource, /eq\(products\.workspaceId, workspaceId\)/);
assert.match(pageSource, /Lancer l’audit du lot/);
assert.equal(serviceSource.includes("validateProductDraft"), false);
assert.equal(serviceSource.includes("validatedData"), false);
assert.equal(combinedSource.includes("OpenAI"), false);
assert.equal(combinedSource.includes("fetch("), false);
assert.equal(combinedSource.includes("delete(products)"), false);

console.log("Batch audit action coverage passed.");
