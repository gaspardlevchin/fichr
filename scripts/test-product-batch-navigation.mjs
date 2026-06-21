import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { buildProductBatchNavigation } from "../src/server/products/import-batch-core.ts";

const products = [
  {
    createdAt: "2026-06-19T10:03:00.000Z",
    deletedAt: null,
    id: "prd_third",
    importId: "imp_a",
    rowIndex: 30,
    title: "Troisième",
    workspaceId: "wks_a"
  },
  {
    createdAt: "2026-06-19T10:01:00.000Z",
    deletedAt: null,
    id: "prd_first",
    importId: "imp_a",
    rowIndex: 10,
    title: "Premier",
    workspaceId: "wks_a"
  },
  {
    createdAt: "2026-06-19T10:02:00.000Z",
    deletedAt: null,
    id: "prd_second",
    importId: "imp_a",
    rowIndex: 20,
    title: "Deuxième",
    workspaceId: "wks_a"
  },
  {
    createdAt: "2026-06-19T10:00:00.000Z",
    deletedAt: "2026-06-19T11:00:00.000Z",
    id: "prd_deleted",
    importId: "imp_a",
    rowIndex: 5,
    title: "Supprimé",
    workspaceId: "wks_a"
  },
  {
    createdAt: "2026-06-19T09:00:00.000Z",
    deletedAt: null,
    id: "prd_other_import",
    importId: "imp_b",
    rowIndex: 1,
    title: "Autre import",
    workspaceId: "wks_a"
  },
  {
    createdAt: "2026-06-19T09:00:00.000Z",
    deletedAt: null,
    id: "prd_other_workspace",
    importId: "imp_a",
    rowIndex: 1,
    title: "Autre workspace",
    workspaceId: "wks_b"
  }
];

assert.deepEqual(
  buildProductBatchNavigation(products, {
    currentProductId: "prd_first",
    importId: "imp_a",
    workspaceId: "wks_a"
  }),
  {
    importId: "imp_a",
    nextProductId: "prd_second",
    position: 1,
    previousProductId: null,
    total: 3
  }
);
assert.deepEqual(
  buildProductBatchNavigation(products, {
    currentProductId: "prd_second",
    importId: "imp_a",
    workspaceId: "wks_a"
  }),
  {
    importId: "imp_a",
    nextProductId: "prd_third",
    position: 2,
    previousProductId: "prd_first",
    total: 3
  }
);
assert.deepEqual(
  buildProductBatchNavigation(products, {
    currentProductId: "prd_third",
    importId: "imp_a",
    workspaceId: "wks_a"
  }),
  {
    importId: "imp_a",
    nextProductId: null,
    position: 3,
    previousProductId: "prd_second",
    total: 3
  }
);
assert.equal(
  buildProductBatchNavigation(products, {
    currentProductId: "prd_deleted",
    importId: "imp_a",
    workspaceId: "wks_a"
  }),
  null
);

const pageSource = await readFile(
  "src/app/products/[productId]/page.tsx",
  "utf8"
);
const serviceSource = await readFile(
  "src/server/products/import-batch.ts",
  "utf8"
);
assert.match(pageSource, /aria-label="Produit précédent du lot"/);
assert.match(pageSource, /aria-label="Produit suivant du lot"/);
assert.match(pageSource, /Précédent/);
assert.match(pageSource, /Suivant/);
assert.match(pageSource, /Retour au lot/);
assert.match(serviceSource, /eq\(products\.workspaceId, access\.workspaceId\)/);
assert.match(serviceSource, /if \(!product\?\.importId \|\| product\.deletedAt\)/);

console.log("Product batch navigation coverage passed.");
