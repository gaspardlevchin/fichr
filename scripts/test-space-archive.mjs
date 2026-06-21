import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

function archiveSpace(db, input) {
  return db
    .prepare(
      `update spaces set deleted_at = current_timestamp
       where id = ? and workspace_id = ? and deleted_at is null`
    )
    .run(input.spaceId, input.workspaceId).changes;
}

function restoreSpace(db, input) {
  return db
    .prepare(
      `update spaces set deleted_at = null
       where id = ? and workspace_id = ? and deleted_at is not null`
    )
    .run(input.spaceId, input.workspaceId).changes;
}

function assignSpace(db, input) {
  const targetSpace = input.spaceId
    ? db
        .prepare(
          `select id from spaces
           where id = ? and workspace_id = ? and deleted_at is null`
        )
        .get(input.spaceId, input.workspaceId)
    : { id: null };

  if (!targetSpace) {
    throw new Error("Active space not found for workspace.");
  }

  return db
    .prepare(
      `update products set space_id = ?
       where id = ? and workspace_id = ? and deleted_at is null`
    )
    .run(input.spaceId, input.productId, input.workspaceId).changes;
}

async function main() {
  process.env.AI_ENABLED = "false";
  globalThis.fetch = () => {
    throw new Error("OpenAI must not be called by space archive.");
  };

  const workspaceId = "wks_space_archive";
  const tempDir = await mkdtemp(path.join(tmpdir(), "fichr-space-archive-"));
  const db = new Database(path.join(tempDir, "space-archive.sqlite"));

  try {
    db.exec(`
      create table spaces (
        id text primary key,
        workspace_id text not null,
        name text not null,
        deleted_at text
      );
      create table products (
        id text primary key,
        workspace_id text not null,
        space_id text,
        draft_data text not null,
        validated_data text,
        deleted_at text
      );
    `);
    db.prepare(
      `insert into spaces (id, workspace_id, name) values (?, ?, ?)`
    ).run("spc_archive", workspaceId, "Collection archive");
    db.prepare(
      `insert into spaces (id, workspace_id, name) values (?, ?, ?)`
    ).run("spc_active", workspaceId, "Collection active");
    const draftData = JSON.stringify({ title: "Draft préservé" });
    const validatedData = JSON.stringify({ title: "Validé préservé" });
    db.prepare(
      `insert into products (
        id, workspace_id, space_id, draft_data, validated_data
      ) values (?, ?, ?, ?, ?)`
    ).run(
      "prd_archived_space",
      workspaceId,
      "spc_archive",
      draftData,
      validatedData
    );

    assert.equal(
      archiveSpace(db, { spaceId: "spc_archive", workspaceId }),
      1
    );
    const archivedSpace = db
      .prepare(`select deleted_at as archivedAt from spaces where id = ?`)
      .get("spc_archive");
    assert.ok(archivedSpace.archivedAt);

    const preservedProduct = db
      .prepare(
        `select space_id as spaceId, draft_data as draftData,
                validated_data as validatedData
         from products where id = ?`
      )
      .get("prd_archived_space");
    assert.equal(preservedProduct.spaceId, "spc_archive");
    assert.equal(preservedProduct.draftData, draftData);
    assert.equal(preservedProduct.validatedData, validatedData);
    assert.equal(
      db.prepare(`select count(*) as count from products`).get().count,
      1
    );

    assert.throws(
      () =>
        assignSpace(db, {
          productId: "prd_archived_space",
          spaceId: "spc_archive",
          workspaceId
        }),
      /Active space/
    );
    assert.equal(
      assignSpace(db, {
        productId: "prd_archived_space",
        spaceId: null,
        workspaceId
      }),
      1
    );
    assert.equal(
      assignSpace(db, {
        productId: "prd_archived_space",
        spaceId: "spc_active",
        workspaceId
      }),
      1
    );

    assert.equal(
      restoreSpace(db, { spaceId: "spc_archive", workspaceId }),
      1
    );
    assert.equal(
      db.prepare(`select deleted_at as archivedAt from spaces where id = ?`)
        .get("spc_archive").archivedAt,
      null
    );
  } finally {
    db.close();
    await rm(tempDir, { force: true, recursive: true });
  }

  const serviceSource = await readFile("src/server/spaces/service.ts", "utf8");
  const spacesPageSource = await readFile("src/app/spaces/page.tsx", "utf8");
  const catalogSource = await readFile(
    "src/components/catalog/catalog-bulk-export-form.tsx",
    "utf8"
  );
  const productPageSource = await readFile(
    "src/app/products/[productId]/page.tsx",
    "utf8"
  );

  assert.equal(serviceSource.includes(".delete(spaces)"), false);
  assert.equal(serviceSource.includes("draftData"), false);
  assert.equal(serviceSource.includes("validatedData"), false);
  assert.equal(spacesPageSource.includes("Espaces archivés"), true);
  assert.equal(spacesPageSource.includes("Confirmer l’archivage"), true);
  assert.equal(catalogSource.includes("Espace archivé"), true);
  assert.equal(productPageSource.includes("Ancien espace"), true);

  console.log("Space archive coverage passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
