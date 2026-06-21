import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import Database from "better-sqlite3";

import { resolveWorkspaceAccess } from "../src/server/auth/access-core.ts";

async function main() {
  const roles = ["owner", "admin", "editor", "viewer"];
  const access = resolveWorkspaceAccess(
    "usr_owner",
    [{ role: "owner", workspaceId: "wks_owner" }],
    roles
  );

  assert.deepEqual(access, {
    role: "owner",
    userId: "usr_owner",
    workspaceId: "wks_owner"
  });
  assert.equal(
    resolveWorkspaceAccess(
      "usr_viewer",
      [{ role: "viewer", workspaceId: "wks_viewer" }],
      ["owner", "admin"]
    ),
    null
  );
  assert.equal(resolveWorkspaceAccess("usr_none", [], roles), null);

  const sqlite = new Database(":memory:");
  sqlite.exec(`
    create table products (
      id text primary key,
      workspace_id text not null,
      title text not null
    );
    create table spaces (
      id text primary key,
      workspace_id text not null,
      name text not null
    );
    create table exports (
      id text primary key,
      workspace_id text not null
    );
  `);
  sqlite
    .prepare("insert into products values (?, ?, ?)")
    .run("prd_owner", "wks_owner", "Owner product");
  sqlite
    .prepare("insert into products values (?, ?, ?)")
    .run("prd_other", "wks_other", "Other product");
  sqlite
    .prepare("insert into spaces values (?, ?, ?)")
    .run("spc_other", "wks_other", "Other space");
  sqlite
    .prepare("insert into exports values (?, ?)")
    .run("exp_other", "wks_other");

  const productQuery = sqlite.prepare(
    "select id from products where id = ? and workspace_id = ?"
  );
  assert.equal(productQuery.get("prd_owner", access.workspaceId).id, "prd_owner");
  assert.equal(productQuery.get("prd_other", access.workspaceId), undefined);
  assert.equal(
    sqlite
      .prepare("select id from spaces where id = ? and workspace_id = ?")
      .get("spc_other", access.workspaceId),
    undefined
  );
  assert.equal(
    sqlite
      .prepare("select id from exports where id = ? and workspace_id = ?")
      .get("exp_other", access.workspaceId),
    undefined
  );
  sqlite.close();

  const protectedServices = [
    "src/server/products/queries.ts",
    "src/server/products/actions.ts",
    "src/server/products/media.ts",
    "src/server/products/deletion.ts",
    "src/server/products/import-products.ts",
    "src/server/spaces/service.ts",
    "src/server/imports/service.ts",
    "src/server/imports/queries.ts",
    "src/server/exports/service.ts",
    "src/server/audit/product-audit.ts",
    "src/server/ai/product-suggestions.ts"
  ];
  const serviceSources = await Promise.all(
    protectedServices.map(async (file) => ({
      file,
      source: await readFile(file, "utf8")
    }))
  );

  for (const { file, source } of serviceSources) {
    assert.equal(
      source.includes("requireWorkspaceAccess") ||
        source.includes("getCsvImportWriteAccess") ||
        source.includes("getCsvImportReadAccess"),
      true,
      `${file} must derive workspace access from the server session`
    );
    assert.equal(source.includes("getLocalDevelopmentWorkspaceAccess"), false);
  }

  const actionSources = await Promise.all(
    [
      "src/server/products/actions.ts",
      "src/server/spaces/actions.ts",
      "src/server/imports/actions.ts",
      "src/server/exports/actions.ts"
    ].map((file) => readFile(file, "utf8"))
  );
  assert.equal(
    actionSources.some((source) =>
      /formData\.get\([\"']workspaceId[\"']\)/.test(source)
    ),
    false
  );

  const imageRoute = await readFile(
    "src/app/products/[productId]/image/route.ts",
    "utf8"
  );
  const exportRoute = await readFile(
    "src/app/exports/[exportId]/download/route.ts",
    "utf8"
  );
  assert.match(imageRoute, /getProductImageDownload/);
  assert.match(exportRoute, /getCatalogExportDownload/);

  console.log("Workspace access coverage passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
