import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

import {
  assertImportCreationQuotas,
  assertImportMappingComplete,
  buildImportDraftCreationPlan
} from "../src/server/imports/creation-core.ts";
import {
  ImportMappingIncompleteError,
  ImportQuotaExceededError,
  ImportStorageError,
  getImportActionErrorMessage
} from "../src/server/imports/errors.ts";

function createRows(count) {
  return Array.from({ length: count }, (_, index) => ({
    correctedData: null,
    id: `row_${index + 1}`,
    rawData: {
      description: `Description ${index + 1}`,
      espace: `Collection ${(index % 3) + 1}`,
      nom: `Produit ${index + 1}`,
      prix: `${100 + index}`
    },
    rowIndex: index + 1
  }));
}

function applyCreationPlan(database, input) {
  assertImportCreationQuotas({
    currentProductCount: 0,
    currentSpaceCount: 0,
    newSpaceCount: input.newSpaceCount,
    planKey: input.planKey,
    productCount: input.plan.candidates.length
  });

  database.transaction(() => {
    const insertSpace = database.prepare(
      "insert or ignore into spaces (name) values (?)"
    );
    const insertProduct = database.prepare(
      "insert into products (id, title) values (?, ?)"
    );

    for (const candidate of input.plan.candidates) {
      if (candidate.mappedSpaceName) {
        insertSpace.run(candidate.mappedSpaceName);
      }

      insertProduct.run(candidate.rowId, candidate.title);
    }
  })();
}

const mapping = {
  description: "description",
  current_price: "prix",
  space_name: "espace",
  title: "nom"
};
const rows = createRows(30);
const plan = buildImportDraftCreationPlan({ mapping, rows });
const tempDir = await mkdtemp(
  path.join(tmpdir(), "fichr-csv-entitlements-test-")
);

try {
  assert.equal(plan.candidates.length, 30);
  assert.equal(plan.skippedRowIds.length, 0);
  assert.equal(
    new Set(
      plan.candidates.flatMap((candidate) =>
        candidate.mappedSpaceName ? [candidate.mappedSpaceName] : []
      )
    ).size,
    3
  );

  const database = new Database(path.join(tempDir, "csv-entitlements.sqlite"));
  database.exec(`
    create table products (
      id text primary key,
      title text not null
    );
    create table spaces (
      id integer primary key autoincrement,
      name text not null unique
    );
  `);

  assert.throws(
    () =>
      applyCreationPlan(database, {
        newSpaceCount: 3,
        plan,
        planKey: "demo"
      }),
    (error) =>
      error instanceof ImportQuotaExceededError &&
      /plan Démo autorise 10 produits/.test(error.message) &&
      /30 lignes prêtes à créer/.test(error.message) &&
      /Passez en Studio/.test(error.message)
  );
  assert.equal(
    database.prepare("select count(*) as count from products").get().count,
    0
  );
  assert.equal(
    database.prepare("select count(*) as count from spaces").get().count,
    0
  );

  const threeRowsPlan = buildImportDraftCreationPlan({
    mapping,
    rows: rows.slice(0, 3)
  });
  assert.throws(
    () =>
      applyCreationPlan(database, {
        newSpaceCount: 3,
        plan: threeRowsPlan,
        planKey: "demo"
      }),
    (error) =>
      error instanceof ImportQuotaExceededError &&
      /plan Démo autorise 2 espaces/.test(error.message) &&
      /3 nouveaux espaces/.test(error.message)
  );
  assert.equal(
    database.prepare("select count(*) as count from products").get().count,
    0
  );
  assert.equal(
    database.prepare("select count(*) as count from spaces").get().count,
    0
  );

  applyCreationPlan(database, {
    newSpaceCount: 3,
    plan,
    planKey: "studio"
  });
  assert.equal(
    database.prepare("select count(*) as count from products").get().count,
    30
  );
  assert.equal(
    database.prepare("select count(*) as count from spaces").get().count,
    3
  );
  database.close();

  assert.throws(
    () => assertImportMappingComplete({ description: "description" }),
    (error) =>
      error instanceof ImportMappingIncompleteError &&
      /au moins un nom de produit/.test(error.message)
  );

  const storageMessage = getImportActionErrorMessage(
    new ImportStorageError()
  );
  assert.match(storageMessage, /stockage local/);
  assert.equal(storageMessage.includes(tempDir), false);

  const actionSource = await readFile("src/server/imports/actions.ts", "utf8");
  const productServiceSource = await readFile(
    "src/server/products/import-products.ts",
    "utf8"
  );
  const importServiceSource = await readFile(
    "src/server/imports/service.ts",
    "utf8"
  );
  const allSources = `${actionSource}\n${productServiceSource}\n${importServiceSource}`;

  assert.equal(allSources.includes("CSV import failed."), false);
  assert.match(actionSource, /let result;/);
  assert.match(
    actionSource,
    /catch \(error\)[\s\S]*redirect\([\s\S]*\}\s*\n\s*redirect\(\s*`\/imports\/\$\{encodeURIComponent\(importId\)\}\?created=/
  );
  assert.equal(
    productServiceSource.indexOf("assertImportCreationQuotas") <
      productServiceSource.indexOf("db.transaction((tx)"),
    true
  );
  assert.match(productServiceSource, /db\.transaction\(\(tx\) =>/);
  assert.match(importServiceSource, /ImportStorageError/);
  assert.equal(allSources.includes("AI_ENABLED"), false);
  assert.equal(allSources.includes("fetch("), false);

  const sensitiveError = getImportActionErrorMessage(
    new Error(
      `SECRET_IMPORT_VALUE ${tempDir}/storage/imports/private.csv`
    )
  );
  assert.equal(sensitiveError.includes("SECRET_IMPORT_VALUE"), false);
  assert.equal(sensitiveError.includes(tempDir), false);
  assert.equal(sensitiveError.includes("CSV import failed."), false);
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

console.log("CSV import entitlement coverage passed.");
