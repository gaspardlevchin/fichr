import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

import { assertProductDeletionConfirmation } from "../src/server/products/product-mutation-core.ts";

function softDeleteScopedProduct(db, input) {
  const product = db
    .prepare(
      `select id, title from products
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
      `update products
       set deleted_at = current_timestamp
       where id = ? and workspace_id = ? and deleted_at is null`
    )
    .run(input.productId, input.workspaceId).changes;
}

async function main() {
  process.env.AI_ENABLED = "false";
  globalThis.fetch = () => {
    throw new Error("OpenAI must not be called by product deletion.");
  };

  assert.throws(
    () =>
      assertProductDeletionConfirmation({
        confirmation: "",
        title: "Produit à supprimer"
      }),
    /exactement/
  );
  assert.throws(
    () =>
      assertProductDeletionConfirmation({
        confirmation: "SUPPRIMER",
        title: "Produit à supprimer"
      }),
    /exactement/
  );

  const tempDir = await mkdtemp(path.join(tmpdir(), "fichr-product-delete-"));
  const db = new Database(path.join(tempDir, "product-delete.sqlite"));

  try {
    db.exec(`
      create table products (
        id text primary key,
        workspace_id text not null,
        title text not null,
        image_url text,
        draft_data text not null,
        validated_data text,
        deleted_at text
      );
    `);
    const insertProduct = db.prepare(
      `insert into products (
        id, workspace_id, title, image_url, draft_data, validated_data
      ) values (?, ?, ?, ?, ?, ?)`
    );
    const draftSnapshot = JSON.stringify({ title: "Brouillon conservé" });
    const validatedSnapshot = JSON.stringify({ title: "Snapshot conservé" });
    insertProduct.run(
      "prd_delete",
      "wks_delete",
      "Produit à supprimer",
      "/products/prd_delete/image",
      draftSnapshot,
      validatedSnapshot
    );
    insertProduct.run(
      "prd_other",
      "wks_other",
      "Produit autre workspace",
      null,
      "{}",
      null
    );

    assert.throws(
      () =>
        softDeleteScopedProduct(db, {
          confirmation: "Produit à supprimer",
          productId: "prd_other",
          workspaceId: "wks_delete"
        }),
      /workspace/
    );
    assert.equal(
      softDeleteScopedProduct(db, {
        confirmation: "Produit à supprimer",
        productId: "prd_delete",
        workspaceId: "wks_delete"
      }),
      1
    );

    const deletedProduct = db
      .prepare(
        `select image_url as imageUrl, draft_data as draftData,
                validated_data as validatedData, deleted_at as deletedAt
         from products where id = ?`
      )
      .get("prd_delete");
    assert.ok(deletedProduct.deletedAt);
    assert.equal(deletedProduct.imageUrl, "/products/prd_delete/image");
    assert.equal(deletedProduct.draftData, draftSnapshot);
    assert.equal(deletedProduct.validatedData, validatedSnapshot);
    assert.equal(
      db.prepare(`select count(*) as count from products where id = ?`)
        .get("prd_delete").count,
      1
    );
  } finally {
    db.close();
    await rm(tempDir, { force: true, recursive: true });
  }

  const actionSource = await readFile("src/server/products/actions.ts", "utf8");
  const deletionSource = await readFile(
    "src/server/products/deletion.ts",
    "utf8"
  );
  const productPageSource = await readFile(
    "src/app/products/[productId]/page.tsx",
    "utf8"
  );
  assert.equal(actionSource.includes("deleteProductAction"), true);
  assert.equal(actionSource.includes("restoreProductAction"), true);
  assert.equal(actionSource.includes("export async function GET"), false);
  assert.equal(deletionSource.includes(".delete(products)"), false);
  assert.equal(deletionSource.includes("deletedAt: sql`CURRENT_TIMESTAMP`"), true);
  assert.equal(deletionSource.includes("deleteProductImageAsset"), false);
  assert.equal(productPageSource.includes("name=\"confirmation\""), true);
  assert.equal(productPageSource.includes("Restaurer la fiche"), true);
  assert.equal(
    existsSync("src/app/products/[productId]/delete/route.ts"),
    false
  );
  assert.equal(
    existsSync("src/app/products/[productId]/restore/route.ts"),
    false
  );

  console.log("Product deletion safety coverage passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
