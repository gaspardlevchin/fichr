import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { buildProductImportOrigin } from "../src/server/products/import-origin.ts";

const origin = buildProductImportOrigin({
  importCreatedAt: "2026-06-19T10:00:00.000Z",
  importId: "imp_source",
  importOriginalFilename: "catalogue-source.csv",
  importRowIndex: 12
});

assert.deepEqual(origin, {
  createdAt: "2026-06-19T10:00:00.000Z",
  id: "imp_source",
  originalFilename: "catalogue-source.csv",
  rowIndex: 12
});
assert.equal(
  buildProductImportOrigin({
    importCreatedAt: null,
    importId: null,
    importOriginalFilename: null,
    importRowIndex: null
  }),
  null
);
assert.equal(
  buildProductImportOrigin({
    importCreatedAt: null,
    importId: "imp_missing",
    importOriginalFilename: null,
    importRowIndex: null
  }),
  null
);

const querySource = await readFile("src/server/products/queries.ts", "utf8");
const productPageSource = await readFile(
  "src/app/products/[productId]/page.tsx",
  "utf8"
);
const importPageSource = await readFile(
  "src/app/imports/[importId]/page.tsx",
  "utf8"
);
const preflightSource = await readFile(
  "src/components/import/import-creation-preflight.tsx",
  "utf8"
);
const combinedSource = [
  querySource,
  productPageSource,
  importPageSource,
  preflightSource
].join("\n");

assert.match(querySource, /eq\(imports\.workspaceId, access\.workspaceId\)/);
assert.match(querySource, /eq\(importRows\.workspaceId, access\.workspaceId\)/);
assert.match(querySource, /importRowIndex: importRows\.rowIndex/);
assert.match(productPageSource, /Origine de la fiche/);
assert.match(productPageSource, /Voir l’import/);
assert.match(productPageSource, /Voir le lot importé/);
assert.match(productPageSource, /if \(!product\.importOrigin\)/);
assert.match(importPageSource, /ImportCreatedProducts/);
assert.match(preflightSource, /Voir les produits créés/);
assert.match(preflightSource, /\/catalog\?import=/);
assert.equal(combinedSource.includes("storagePath"), false);
assert.equal(combinedSource.includes("AUTH_SESSION_SECRET"), false);
assert.equal(combinedSource.includes("validatedData ="), false);
assert.equal(combinedSource.includes("OpenAI"), false);

console.log("Product import origin coverage passed.");
