import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

import {
  applyCatalogFilters,
  getWorkspaceCatalogProducts,
  normalizeCatalogFilters
} from "../src/server/products/catalog-filters.ts";
import { resolveExportProductSelection } from "../src/server/exports/core.ts";
import {
  normalizeSpaceDescription,
  normalizeSpaceName
} from "../src/server/spaces/core.ts";

function createSpace(db, input) {
  const name = normalizeSpaceName(input.name);
  const description = normalizeSpaceDescription(input.description ?? "");

  db.prepare(
    `insert into spaces (id, workspace_id, name, description)
     values (?, ?, ?, ?)`
  ).run(input.id, input.workspaceId, name, description);
}

function assignSpace(db, input) {
  const product = db
    .prepare(
      `select id from products
       where id = ? and workspace_id = ? and deleted_at is null`
    )
    .get(input.productId, input.workspaceId);

  if (!product) {
    throw new Error("Active product not found for workspace.");
  }

  if (input.spaceId) {
    const space = db
      .prepare(
        `select id from spaces
         where id = ? and workspace_id = ? and deleted_at is null`
      )
      .get(input.spaceId, input.workspaceId);

    if (!space) {
      throw new Error("Space not found for workspace.");
    }
  }

  return db
    .prepare(
      `update products set space_id = ?
       where id = ? and workspace_id = ? and deleted_at is null`
    )
    .run(input.spaceId, input.productId, input.workspaceId).changes;
}

function readCatalogRows(db, workspaceId) {
  return db
    .prepare(
      `select p.id, p.workspace_id as workspaceId, p.status, p.title,
              p.subtitle, p.category, p.description,
              p.current_price as currentPrice, p.desired_price as desiredPrice,
              p.image_url as imageUrl, p.import_id as importId, p.sku,
              p.created_at as createdAt, p.deleted_at as deletedAt,
              p.space_id as spaceId, s.name as spaceName
       from products p
       left join spaces s
         on s.id = p.space_id and s.workspace_id = p.workspace_id
       where p.workspace_id = ?
       order by p.id`
    )
    .all(workspaceId);
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

async function main() {
  process.env.AI_ENABLED = "false";
  globalThis.fetch = () => {
    throw new Error("OpenAI must not be called by spaces organization.");
  };

  assert.throws(() => normalizeSpaceName("   "), /obligatoire/);
  assert.throws(() => normalizeSpaceName("x".repeat(81)), /80/);
  assert.equal(normalizeSpaceName("  Mission   client  "), "Mission client");

  const workspaceId = "wks_spaces";
  const otherWorkspaceId = "wks_spaces_other";
  const tempDir = await mkdtemp(path.join(tmpdir(), "fichr-spaces-"));
  const db = new Database(path.join(tempDir, "spaces.sqlite"));

  try {
    db.exec(`
      create table spaces (
        id text primary key,
        workspace_id text not null,
        name text not null,
        description text,
        deleted_at text
      );
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
    createSpace(db, {
      id: "spc_main",
      workspaceId,
      name: "Mission client",
      description: "Lot principal"
    });
    createSpace(db, {
      id: "spc_other",
      workspaceId: otherWorkspaceId,
      name: "Espace externe"
    });

    const insert = db.prepare(
      `insert into products (
        id, workspace_id, space_id, status, title, category, sku,
        draft_data, validated_data, deleted_at, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insert.run(
      "prd_unassigned",
      workspaceId,
      null,
      "draft",
      "Sans espace",
      "Objet",
      "UN-1",
      JSON.stringify({ title: "Sans espace" }),
      null,
      null,
      "2026-06-18 10:00:00"
    );
    const assignedDraft = JSON.stringify({ title: "Assigné" });
    const assignedValidated = JSON.stringify({ title: "Assigné validé" });
    insert.run(
      "prd_assigned",
      workspaceId,
      "spc_main",
      "validated",
      "Produit assigné",
      "Objet",
      "AS-1",
      assignedDraft,
      assignedValidated,
      null,
      "2026-06-18 11:00:00"
    );
    insert.run(
      "prd_deleted",
      workspaceId,
      "spc_main",
      "validated",
      "Produit supprimé",
      "Objet",
      "DEL-1",
      "{}",
      JSON.stringify({ title: "NEVER_EXPORT_DELETED" }),
      "2026-06-18 12:00:00",
      "2026-06-18 12:00:00"
    );

    assert.throws(
      () =>
        assignSpace(db, {
          productId: "prd_unassigned",
          spaceId: "spc_other",
          workspaceId
        }),
      /workspace/
    );
    assert.throws(
      () =>
        assignSpace(db, {
          productId: "prd_deleted",
          spaceId: null,
          workspaceId
        }),
      /Active product/
    );

    let catalog = getWorkspaceCatalogProducts(
      readCatalogRows(db, workspaceId),
      workspaceId
    );
    assert.deepEqual(
      applyCatalogFilters(
        catalog,
        normalizeCatalogFilters({ space: "unassigned" })
      ).map((product) => product.id),
      ["prd_unassigned"]
    );
    assert.deepEqual(
      applyCatalogFilters(
        catalog,
        normalizeCatalogFilters({ space: "spc_main" })
      ).map((product) => product.id),
      ["prd_assigned"]
    );
    assert.deepEqual(
      applyCatalogFilters(
        catalog,
        normalizeCatalogFilters({ deleted: "deleted", space: "spc_main" })
      ).map((product) => product.id),
      ["prd_deleted"]
    );

    assert.equal(
      assignSpace(db, {
        productId: "prd_unassigned",
        spaceId: "spc_main",
        workspaceId
      }),
      1
    );
    assert.equal(
      assignSpace(db, {
        productId: "prd_assigned",
        spaceId: null,
        workspaceId
      }),
      1
    );
    const snapshots = db
      .prepare(
        `select draft_data as draftData, validated_data as validatedData
         from products where id = ?`
      )
      .get("prd_assigned");
    assert.equal(snapshots.draftData, assignedDraft);
    assert.equal(snapshots.validatedData, assignedValidated);

    catalog = getWorkspaceCatalogProducts(
      readCatalogRows(db, workspaceId),
      workspaceId
    );
    assert.deepEqual(
      applyCatalogFilters(
        catalog,
        normalizeCatalogFilters({ space: "unassigned" })
      ).map((product) => product.id),
      ["prd_assigned"]
    );
    assert.deepEqual(
      applyCatalogFilters(catalog, normalizeCatalogFilters({ space: "all" }))
        .map((product) => product.id),
      ["prd_unassigned", "prd_assigned"]
    );

    const exportSelection = resolveExportProductSelection(
      readExportRows(db, workspaceId)
    );
    assert.deepEqual(
      exportSelection.exportProducts.map((product) => product.id),
      ["prd_assigned"]
    );
    assert.equal(
      JSON.stringify(exportSelection).includes("NEVER_EXPORT_DELETED"),
      false
    );
  } finally {
    db.close();
    await rm(tempDir, { force: true, recursive: true });
  }

  const catalogSource = await readFile("src/app/catalog/page.tsx", "utf8");
  const spacesPageSource = await readFile("src/app/spaces/page.tsx", "utf8");
  const productPageSource = await readFile(
    "src/app/products/[productId]/page.tsx",
    "utf8"
  );
  const stylesSource = await readFile("src/styles/globals.css", "utf8");
  assert.equal(catalogSource.includes("CatalogSpacesPanel"), false);
  assert.equal(catalogSource.includes("createWorkspaceSpaceAction"), false);
  assert.equal(catalogSource.includes('href="/spaces"'), true);
  assert.equal(catalogSource.includes('name="space"'), true);
  assert.equal(spacesPageSource.includes("createWorkspaceSpaceAction"), true);
  assert.equal(spacesPageSource.includes("Fiches sans espace"), true);
  assert.equal(productPageSource.includes("assignProductToSpaceAction"), true);
  assert.equal(productPageSource.includes("Créer ou gérer un espace"), true);
  assert.equal(stylesSource.includes(".secondary-button {"), true);
  assert.equal(
    stylesSource.includes(".catalog-search-form > .primary-button"),
    true
  );
  assert.equal(
    stylesSource.includes(".space-create-form > .primary-button"),
    true
  );

  console.log("Spaces organization coverage passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
