import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

import { resolveExportProductSelection } from "../src/server/exports/core.ts";
import { assertImportBatchConfirmation } from "../src/server/products/import-batch-core.ts";

const tempDir = await mkdtemp(path.join(tmpdir(), "fichr-import-batch-"));
const db = new Database(path.join(tempDir, "batch.sqlite"));
const storageFile = path.join(tempDir, "product-image.bin");
await writeFile(storageFile, "STORAGE_SENTINEL");

try {
  db.exec(`
    create table products (
      id text primary key,
      workspace_id text not null,
      import_id text,
      status text not null,
      title text not null,
      validated_data text,
      deleted_at text,
      deleted_reason text
    );
    create table exports (
      id text primary key,
      workspace_id text not null,
      status text not null,
      storage_path text
    );
  `);
  const insert = db.prepare(
    `insert into products
     (id, workspace_id, import_id, status, title, validated_data, deleted_at)
     values (?, ?, ?, ?, ?, ?, ?)`
  );
  const validatedSnapshot = JSON.stringify({ title: "Validé immuable" });
  insert.run(
    "prd_a_active",
    "wks_a",
    "imp_a",
    "validated",
    "A actif",
    validatedSnapshot,
    null
  );
  insert.run(
    "prd_a_deleted",
    "wks_a",
    "imp_a",
    "draft",
    "A déjà supprimé",
    null,
    "2026-06-19 10:00:00"
  );
  insert.run(
    "prd_b",
    "wks_a",
    "imp_b",
    "validated",
    "B actif",
    validatedSnapshot,
    null
  );
  insert.run(
    "prd_manual",
    "wks_a",
    null,
    "draft",
    "Sans origine",
    null,
    null
  );
  insert.run(
    "prd_other_workspace",
    "wks_b",
    "imp_a",
    "validated",
    "Autre workspace",
    validatedSnapshot,
    null
  );
  db.prepare(
    `insert into exports (id, workspace_id, status, storage_path)
     values (?, ?, ?, ?)`
  ).run("exp_history", "wks_a", "complete", "exports/history.pdf");

  assert.throws(
    () =>
      assertImportBatchConfirmation({
        confirmation: "mauvais.csv",
        originalFilename: "catalogue.csv"
      }),
    /exactement/
  );
  assert.doesNotThrow(() =>
    assertImportBatchConfirmation({
      confirmation: "catalogue.csv",
      originalFilename: "catalogue.csv"
    })
  );

  const softDelete = db.prepare(
    `update products
     set deleted_at = current_timestamp, deleted_reason = 'import_batch'
     where import_id = ? and workspace_id = ? and deleted_at is null`
  );
  assert.equal(softDelete.run("imp_a", "wks_a").changes, 1);
  assert.equal(softDelete.run("imp_a", "wks_a").changes, 0);
  assert.equal(
    db.prepare(`select deleted_at from products where id = ?`).get("prd_b")
      .deleted_at,
    null
  );
  assert.equal(
    db.prepare(`select deleted_at from products where id = ?`).get("prd_manual")
      .deleted_at,
    null
  );
  assert.equal(
    db
      .prepare(`select deleted_at from products where id = ?`)
      .get("prd_other_workspace").deleted_at,
    null
  );
  assert.equal(
    db
      .prepare(`select validated_data from products where id = ?`)
      .get("prd_a_active").validated_data,
    validatedSnapshot
  );
  assert.equal(
    resolveExportProductSelection(
      db
        .prepare(
          `select id, status, title, validated_data as validatedData,
                  deleted_at as deletedAt
           from products where workspace_id = ?`
        )
        .all("wks_a")
        .map((item) => ({
          ...item,
          category: null,
          sku: null,
          validatedData: item.validatedData
            ? JSON.parse(item.validatedData)
            : null
        }))
    ).exportProducts.some((item) => item.id === "prd_a_active"),
    false
  );

  const restore = db.prepare(
    `update products
     set deleted_at = null, deleted_reason = null
     where import_id = ? and workspace_id = ? and deleted_at is not null`
  );
  assert.equal(restore.run("imp_a", "wks_a").changes, 2);
  assert.equal(restore.run("imp_a", "wks_a").changes, 0);
  assert.equal(
    db.prepare(`select count(*) as count from exports`).get().count,
    1
  );
  assert.equal(await readFile(storageFile, "utf8"), "STORAGE_SENTINEL");

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

  assert.match(serviceSource, /eq\(products\.importId, input\.importId\)/);
  assert.match(serviceSource, /eq\(products\.workspaceId, access\.workspaceId\)/);
  assert.match(serviceSource, /isNull\(products\.deletedAt\)/);
  assert.match(serviceSource, /isNotNull\(products\.deletedAt\)/);
  assert.match(pageSource, /Les produits seront masqués, pas supprimés définitivement/);
  assert.match(pageSource, /name="confirmation"/);
  assert.match(pageSource, /action=\{softDeleteImportedProductBatchAction\}/);
  assert.equal(combinedSource.includes(".delete(products)"), false);
  assert.equal(combinedSource.includes("removeProductImage"), false);
  assert.equal(combinedSource.includes("deleteExport"), false);
  assert.equal(combinedSource.includes("validatedData:"), false);
  assert.equal(combinedSource.includes('method="get"'), false);
} finally {
  db.close();
  await rm(tempDir, { force: true, recursive: true });
}

console.log("Import batch soft-delete coverage passed.");
