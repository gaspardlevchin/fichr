import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

import {
  applyCatalogFilters,
  getWorkspaceCatalogProducts,
  normalizeCatalogFilters
} from "../src/server/products/catalog-filters.ts";
import { resolveExportProductSelection } from "../src/server/exports/core.ts";
import { assertProductDeletionConfirmation } from "../src/server/products/product-mutation-core.ts";

function readCatalogRows(db) {
  return db
    .prepare(
      `select id, workspace_id as workspaceId, status, title, subtitle,
              category, description, current_price as currentPrice,
              desired_price as desiredPrice, image_url as imageUrl,
              import_id as importId, sku, created_at as createdAt,
              deleted_at as deletedAt, space_id as spaceId, null as spaceName
       from products order by id`
    )
    .all();
}

function readExportRows(db, workspaceId) {
  return db
    .prepare(
      `select id, category, sku, status, title,
              validated_data as validatedData, deleted_at as deletedAt
       from products where workspace_id = ? order by id`
    )
    .all(workspaceId)
    .map((product) => ({
      ...product,
      validatedData: product.validatedData
        ? JSON.parse(product.validatedData)
        : null
    }));
}

function softDelete(db, input) {
  const product = db
    .prepare(
      `select title from products
       where id = ? and workspace_id = ? and deleted_at is null`
    )
    .get(input.productId, input.workspaceId);

  if (!product) {
    throw new Error("Product not found for workspace.");
  }

  assertProductDeletionConfirmation({
    confirmation: input.confirmation,
    title: product.title
  });

  return db
    .prepare(
      `update products set deleted_at = current_timestamp
       where id = ? and workspace_id = ? and deleted_at is null`
    )
    .run(input.productId, input.workspaceId).changes;
}

function restore(db, input) {
  return db
    .prepare(
      `update products set deleted_at = null
       where id = ? and workspace_id = ? and deleted_at is not null`
    )
    .run(input.productId, input.workspaceId).changes;
}

async function main() {
  process.env.AI_ENABLED = "false";
  globalThis.fetch = () => {
    throw new Error("OpenAI must not be called by soft deletion.");
  };

  const workspaceId = "wks_soft_delete";
  const tempDir = await mkdtemp(path.join(tmpdir(), "fichr-soft-delete-"));
  const db = new Database(path.join(tempDir, "soft-delete.sqlite"));

  try {
    db.exec(`
      create table products (
        id text primary key,
        workspace_id text not null,
        import_id text,
        space_id text,
        status text not null,
        title text not null,
        subtitle text,
        category text,
        description text,
        current_price real,
        desired_price real,
        image_url text,
        sku text,
        draft_data text not null,
        validated_data text,
        deleted_at text,
        created_at text not null
      );
    `);
    const insert = db.prepare(
      `insert into products (
        id, workspace_id, status, title, draft_data, validated_data, image_url,
        deleted_at, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const draftData = JSON.stringify({ title: "Draft sentinel" });
    const validatedData = JSON.stringify({ title: "Validated sentinel" });
    insert.run(
      "prd_soft",
      workspaceId,
      "validated",
      "Produit restaurable",
      draftData,
      validatedData,
      "/products/prd_soft/image",
      null,
      "2026-06-18 10:00:00"
    );
    insert.run(
      "prd_keep",
      workspaceId,
      "draft",
      "Produit actif",
      "{}",
      null,
      null,
      null,
      "2026-06-18 11:00:00"
    );

    assert.throws(
      () =>
        softDelete(db, {
          confirmation: "",
          productId: "prd_soft",
          workspaceId
        }),
      /exactement/
    );
    assert.throws(
      () =>
        softDelete(db, {
          confirmation: "mauvais titre",
          productId: "prd_soft",
          workspaceId
        }),
      /exactement/
    );
    assert.equal(
      softDelete(db, {
        confirmation: "Produit restaurable",
        productId: "prd_soft",
        workspaceId
      }),
      1
    );

    const deleted = db
      .prepare(
        `select draft_data as draftData, validated_data as validatedData,
                image_url as imageUrl, deleted_at as deletedAt
         from products where id = ?`
      )
      .get("prd_soft");
    assert.ok(deleted.deletedAt);
    assert.equal(deleted.draftData, draftData);
    assert.equal(deleted.validatedData, validatedData);
    assert.equal(deleted.imageUrl, "/products/prd_soft/image");

    const catalogProducts = getWorkspaceCatalogProducts(
      readCatalogRows(db),
      workspaceId
    );
    assert.deepEqual(
      applyCatalogFilters(
        catalogProducts,
        normalizeCatalogFilters({ deleted: "active" })
      ).map((product) => product.id),
      ["prd_keep"]
    );
    assert.deepEqual(
      applyCatalogFilters(
        catalogProducts,
        normalizeCatalogFilters({ deleted: "deleted" })
      ).map((product) => product.id),
      ["prd_soft"]
    );
    assert.throws(
      () =>
        resolveExportProductSelection(readExportRows(db, workspaceId), [
          "prd_soft"
        ]),
      /non valides/
    );

    assert.equal(
      db.prepare(`select count(*) as count from products`).get().count,
      2
    );
    assert.equal(restore(db, { productId: "prd_soft", workspaceId }), 1);
    assert.equal(
      db.prepare(`select deleted_at as deletedAt from products where id = ?`)
        .get("prd_soft").deletedAt,
      null
    );

    const restoredCatalog = getWorkspaceCatalogProducts(
      readCatalogRows(db),
      workspaceId
    );
    assert.deepEqual(
      applyCatalogFilters(
        restoredCatalog,
        normalizeCatalogFilters({ deleted: "active" })
      ).map((product) => product.id),
      ["prd_soft", "prd_keep"]
    );
  } finally {
    db.close();
    await rm(tempDir, { force: true, recursive: true });
  }

  console.log("Product soft deletion coverage passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
