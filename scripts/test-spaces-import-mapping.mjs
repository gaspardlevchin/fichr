import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

import { suggestColumnMapping } from "../src/server/imports/mapping-core.ts";
import { getMappedSpaceName } from "../src/server/imports/space-mapping.ts";

function resolveSpace(db, input) {
  const name = getMappedSpaceName(input.row, input.mapping);

  if (!name) {
    return null;
  }

  const existing = db
    .prepare(
      `select id from spaces
       where workspace_id = ? and name = ? and deleted_at is null`
    )
    .get(input.workspaceId, name);

  if (existing) {
    return existing.id;
  }

  const id = `spc_${input.workspaceId}_${db.prepare(
    `select count(*) as count from spaces where workspace_id = ?`
  ).get(input.workspaceId).count + 1}`;
  db.prepare(
    `insert into spaces (id, workspace_id, name) values (?, ?, ?)`
  ).run(id, input.workspaceId, name);
  return id;
}

async function main() {
  process.env.AI_ENABLED = "false";
  globalThis.fetch = () => {
    throw new Error("OpenAI must not be called by space import mapping.");
  };

  for (const column of [
    "espace",
    "space",
    "collection",
    "projet",
    "project",
    "gamme",
    "dossier",
    "folder"
  ]) {
    assert.equal(suggestColumnMapping([column]).space_name, column);
  }
  assert.equal(suggestColumnMapping(["collection"]).category, undefined);

  assert.equal(
    getMappedSpaceName(
      { Espace: "  Mission   client  " },
      { space_name: "Espace" }
    ),
    "Mission client"
  );
  assert.equal(
    getMappedSpaceName({ Espace: "   " }, { space_name: "Espace" }),
    null
  );
  assert.equal(
    getMappedSpaceName({ Espace: "Sans mapping" }, {}),
    null
  );
  assert.equal(
    getMappedSpaceName(
      { Espace: "x".repeat(100) },
      { space_name: "Espace" }
    )?.length,
    80
  );

  const workspaceId = "wks_import_space";
  const otherWorkspaceId = "wks_import_space_other";
  const tempDir = await mkdtemp(path.join(tmpdir(), "fichr-space-import-"));
  const db = new Database(path.join(tempDir, "space-import.sqlite"));

  try {
    db.exec(`
      create table spaces (
        id text primary key,
        workspace_id text not null,
        name text not null,
        deleted_at text,
        unique(workspace_id, name)
      );
    `);
    db.prepare(
      `insert into spaces (id, workspace_id, name) values (?, ?, ?)`
    ).run("spc_existing", workspaceId, "Showroom");
    db.prepare(
      `insert into spaces (id, workspace_id, name) values (?, ?, ?)`
    ).run("spc_other", otherWorkspaceId, "Mission client");

    const existingId = resolveSpace(db, {
      mapping: { space_name: "espace" },
      row: { espace: "Showroom" },
      workspaceId
    });
    assert.equal(existingId, "spc_existing");
    assert.equal(
      db.prepare(
        `select count(*) as count from spaces
         where workspace_id = ? and name = ?`
      ).get(workspaceId, "Showroom").count,
      1
    );

    const createdId = resolveSpace(db, {
      mapping: { space_name: "projet" },
      row: { projet: "  Mission client " },
      workspaceId
    });
    assert.notEqual(createdId, "spc_other");
    assert.equal(
      db.prepare(
        `select count(*) as count from spaces
         where workspace_id = ? and name = ?`
      ).get(workspaceId, "Mission client").count,
      1
    );
    assert.equal(
      resolveSpace(db, {
        mapping: { space_name: "projet" },
        row: { projet: "" },
        workspaceId
      }),
      null
    );
  } finally {
    db.close();
    await rm(tempDir, { force: true, recursive: true });
  }

  const importSource = await readFile(
    "src/server/products/import-products.ts",
    "utf8"
  );
  const creationCoreSource = await readFile(
    "src/server/imports/creation-core.ts",
    "utf8"
  );
  assert.equal(importSource.includes("spaceId,"), true);
  assert.equal(creationCoreSource.includes('field === "space_name"'), true);
  assert.equal(importSource.includes("validatedData"), false);
  assert.equal(creationCoreSource.includes("validatedData"), false);

  console.log("Spaces import mapping coverage passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
