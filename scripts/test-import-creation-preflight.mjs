import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

import { buildImportCreationPreflight } from "../src/server/imports/creation-core.ts";

function createRows(count) {
  return Array.from({ length: count }, (_, index) => ({
    correctedData: null,
    id: `row_${index + 1}`,
    rawData: {
      description: `Description ${index + 1}`,
      espace: `Collection ${(index % 3) + 1}`,
      nom: `Produit ${index + 1}`
    },
    rowIndex: index + 1
  }));
}

function hash(content) {
  return createHash("sha256").update(content).digest("hex");
}

const rows = createRows(30);
const baseInput = {
  blockedRowCount: 0,
  canWrite: true,
  existingProductRowIds: [],
  importedRowCount: 0,
  importStatus: "mapped",
  mapping: {
    description: "description",
    space_name: "espace",
    title: "nom"
  },
  rows,
  spaces: [{ archivedAt: null, name: "Collection 1" }],
  usage: {
    products: 0,
    spaces: 1
  }
};

const demo = buildImportCreationPreflight({
  ...baseInput,
  planKey: "demo"
});
assert.equal(demo.status, "blocked");
assert.equal(demo.canCreate, false);
assert.equal(demo.productsToCreate, 30);
assert.equal(demo.newSpaceCount, 2);
assert.equal(demo.reusedSpaceCount, 1);
assert.match(demo.blockingMessage, /plan Démo autorise 10 produits/);
assert.match(demo.blockingMessage, /30 lignes prêtes à créer/);

const studio = buildImportCreationPreflight({
  ...baseInput,
  planKey: "studio"
});
assert.equal(studio.status, "ready");
assert.equal(studio.canCreate, true);
assert.equal(studio.productsToCreate, 30);
assert.equal(studio.newSpaceCount, 2);
assert.equal(studio.reusedSpaceCount, 1);
assert.equal(studio.productQuota.limit, 500);
assert.equal(studio.productQuota.remaining, 500);
assert.equal(studio.spaceQuota.limit, 40);
assert.equal(studio.blockingMessage, null);

const missingMapping = buildImportCreationPreflight({
  ...baseInput,
  importStatus: "parsed",
  mapping: { description: "description" },
  planKey: "studio"
});
assert.equal(missingMapping.status, "mapping_required");
assert.equal(missingMapping.canCreate, false);
assert.match(missingMapping.blockingMessage, /champ Titre/);

const processed = buildImportCreationPreflight({
  ...baseInput,
  importStatus: "processed",
  importedRowCount: 30,
  planKey: "studio",
  rows: []
});
assert.equal(processed.status, "already_processed");
assert.equal(processed.canCreate, false);
assert.equal(processed.productsToCreate, 0);

const tempDir = await mkdtemp(path.join(tmpdir(), "fichr-import-preflight-"));
const databasePath = path.join(tempDir, "active.sqlite");

try {
  const database = new Database(databasePath);
  database.exec(`
    create table marker (
      id text primary key,
      value text not null
    );
    insert into marker values ('active', 'UNCHANGED');
  `);
  database.close();
  const databaseBefore = await readFile(databasePath);

  buildImportCreationPreflight({
    ...baseInput,
    planKey: "studio"
  });

  const databaseAfter = await readFile(databasePath);
  assert.equal(hash(databaseAfter), hash(databaseBefore));
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

const querySource = await readFile("src/server/imports/queries.ts", "utf8");
const preflightStart = querySource.indexOf(
  "export async function getImportCreationPreflight"
);
const preflightEnd = querySource.indexOf(
  "export async function getRecentImports",
  preflightStart
);
const preflightSource = querySource.slice(preflightStart, preflightEnd);
assert.equal(/\.(insert|update|delete)\(/.test(preflightSource), false);

const creationSource = await readFile(
  "src/server/products/import-products.ts",
  "utf8"
);
assert.match(creationSource, /buildImportDraftCreationPlan/);
assert.match(creationSource, /buildImportCreationSpacePlan/);
assert.match(creationSource, /assertImportCreationQuotas/);
assert.match(creationSource, /importRecord\.status === "processed"/);
assert.match(creationSource, /createdProductCount: 0/);

console.log("Import creation preflight coverage passed.");
