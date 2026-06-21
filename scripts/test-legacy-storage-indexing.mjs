import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

import { analyzeWorkspaceStorage } from "../src/server/storage/health.ts";
import { createLocalStorageProvider } from "../src/server/storage/providers/local.ts";

function runIndexing(args, env) {
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "scripts/storage-index-legacy.mjs",
      ...args
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, ...env }
    }
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "indexing failed");
  }

  return result.stdout;
}

const tempDir = await mkdtemp(path.join(tmpdir(), "fichr-legacy-indexing-"));
const databasePath = path.join(tempDir, "legacy.sqlite");
const storageRoot = path.join(tempDir, "storage");
const workspaceId = "wks_legacy_a";
const otherWorkspaceId = "wks_legacy_b";
const safeFile = path.join(
  storageRoot,
  "imports",
  workspaceId,
  "legacy-source.csv"
);
const unsafeFile = path.join(
  storageRoot,
  "imports",
  workspaceId,
  "unsafe name.csv"
);
const outsideFile = path.join(
  storageRoot,
  "imports",
  otherWorkspaceId,
  "outside.csv"
);

try {
  await mkdir(path.dirname(safeFile), { recursive: true });
  await mkdir(path.dirname(outsideFile), { recursive: true });
  await writeFile(safeFile, "title\nLegacy", "utf8");
  await writeFile(unsafeFile, "title\nUnsafe", "utf8");
  await writeFile(outsideFile, "title\nOutside", "utf8");

  const database = new Database(databasePath);
  database.exec(`
    create table workspaces (
      id text primary key,
      name text not null,
      created_at text not null default CURRENT_TIMESTAMP
    );
    create table storage_objects (
      id text primary key,
      workspace_id text not null,
      provider_kind text not null,
      ownership_mode text not null,
      object_type text not null,
      storage_key text not null,
      filename text not null,
      mime_type text,
      size_bytes integer,
      hash_sha256 text,
      metadata text,
      deleted_at text,
      created_at text not null default CURRENT_TIMESTAMP,
      updated_at text not null default CURRENT_TIMESTAMP,
      unique(workspace_id, provider_kind, storage_key)
    );
    create table products (
      id text primary key,
      workspace_id text not null,
      raw_data text not null,
      draft_data text not null,
      validated_data text
    );
    insert into workspaces (id, name) values
      ('wks_legacy_a', 'Legacy A'),
      ('wks_legacy_b', 'Legacy B');
    insert into products values (
      'prd_sentinel',
      'wks_legacy_a',
      '{"sentinel":"raw"}',
      '{"sentinel":"draft"}',
      '{"sentinel":"validated"}'
    );
  `);
  database.close();

  const env = {
    AI_ENABLED: "false",
    DATABASE_URL: `file:${databasePath}`,
    DATA_OWNERSHIP_MODE: "local_device",
    LOCAL_STORAGE_ROOT: storageRoot,
    STORAGE_PROVIDER: "local"
  };
  const provider = createLocalStorageProvider(storageRoot);
  const beforeReport = await analyzeWorkspaceStorage({
    provider,
    trackedObjects: [],
    workspaceId
  });
  assert.equal(beforeReport.legacyFilesCount, 1);
  assert.equal(beforeReport.unsafePathCount, 1);

  const dryRunOutput = runIndexing(
    ["--workspace", workspaceId, "--dry-run"],
    env
  );
  assert.match(dryRunOutput, /Mode : dry-run/);
  assert.match(dryRunOutput, /Indexables : 1/);
  assert.match(dryRunOutput, /import_source/);
  assert.match(dryRunOutput, /Aucune modification effectuée/);

  const dryRunDatabase = new Database(databasePath, { readonly: true });
  assert.equal(
    dryRunDatabase
      .prepare("select count(*) as count from storage_objects")
      .get().count,
    0
  );
  dryRunDatabase.close();

  const applyOutput = runIndexing(
    ["--workspace", workspaceId, "--apply"],
    env
  );
  assert.match(applyOutput, /1 fichier\(s\) indexé\(s\)/);

  const appliedDatabase = new Database(databasePath, { readonly: true });
  const indexed = appliedDatabase
    .prepare(
      `select workspace_id as workspaceId, object_type as objectType,
              storage_key as storageKey, metadata
       from storage_objects`
    )
    .all();
  assert.equal(indexed.length, 1);
  assert.deepEqual(
    {
      objectType: indexed[0].objectType,
      storageKey: indexed[0].storageKey,
      workspaceId: indexed[0].workspaceId
    },
    {
      objectType: "import_source",
      storageKey: `imports/${workspaceId}/legacy-source.csv`,
      workspaceId
    }
  );
  assert.deepEqual(JSON.parse(indexed[0].metadata), {
    indexedAt: JSON.parse(indexed[0].metadata).indexedAt,
    legacy: true,
    source: "legacy_indexing"
  });
  assert.equal(
    appliedDatabase
      .prepare(
        "select count(*) as count from storage_objects where workspace_id = ?"
      )
      .get(otherWorkspaceId).count,
    0
  );
  const productAfter = appliedDatabase
    .prepare("select raw_data, draft_data, validated_data from products")
    .get();
  assert.deepEqual(productAfter, {
    draft_data: '{"sentinel":"draft"}',
    raw_data: '{"sentinel":"raw"}',
    validated_data: '{"sentinel":"validated"}'
  });
  const trackedObjects = indexed.map((object, index) => ({
    deletedAt: null,
    hashSha256: null,
    id: `sto_${index}`,
    metadata: JSON.parse(object.metadata),
    sizeBytes: null,
    storageKey: object.storageKey,
    workspaceId: object.workspaceId
  }));
  appliedDatabase.close();

  const afterReport = await analyzeWorkspaceStorage({
    provider,
    trackedObjects,
    workspaceId
  });
  assert.equal(afterReport.legacyFilesCount, 0);
  assert.equal(afterReport.legacyIndexedCount, 1);
  assert.equal(afterReport.unsafePathCount, 1);

  const secondApplyOutput = runIndexing(
    ["--workspace", workspaceId, "--apply"],
    env
  );
  assert.match(secondApplyOutput, /0 fichier\(s\) indexé\(s\)/);
  const duplicateDatabase = new Database(databasePath, { readonly: true });
  assert.equal(
    duplicateDatabase
      .prepare("select count(*) as count from storage_objects")
      .get().count,
    1
  );
  duplicateDatabase.close();

  assert.equal(await readFile(safeFile, "utf8"), "title\nLegacy");
  assert.equal(await readFile(unsafeFile, "utf8"), "title\nUnsafe");
  assert.equal(await readFile(outsideFile, "utf8"), "title\nOutside");

  const source = await readFile(
    "scripts/storage-index-legacy.mjs",
    "utf8"
  );
  assert.equal(source.includes("fetch("), false);
  assert.equal(
    /googleapis|dropbox|onedrive|icloud|s3|webdav|openai/i.test(source),
    false
  );
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

console.log("Legacy storage indexing coverage passed.");

