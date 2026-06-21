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

import { verifyLocalBackupManifestHash } from "../src/server/storage/backup.ts";
import { createLocalBackup } from "./local-backup-core.mjs";

function unzip(args) {
  const result = spawnSync("unzip", args, { encoding: "utf8" });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "unzip failed");
  }

  return result.stdout;
}

function unzipBuffer(args) {
  const result = spawnSync("unzip", args);

  if (result.status !== 0) {
    throw new Error(
      result.stderr?.toString("utf8") ||
        result.stdout?.toString("utf8") ||
        "unzip failed"
    );
  }

  return result.stdout;
}

const tempDir = await mkdtemp(path.join(tmpdir(), "fichr-local-backup-test-"));
const databasePath = path.join(tempDir, "db", "fichr.sqlite");
const storageRoot = path.join(tempDir, "storage");
const artifactsDirectory = path.join(tempDir, "artifacts");

try {
  await mkdir(path.dirname(databasePath), { recursive: true });
  await mkdir(path.join(storageRoot, "imports", "wks_backup"), {
    recursive: true
  });
  await mkdir(path.join(tempDir, "node_modules"), { recursive: true });
  await mkdir(path.join(tempDir, ".next"), { recursive: true });
  await writeFile(
    path.join(storageRoot, "imports", "wks_backup", "source.csv"),
    "title\nProduit sauvegardé",
    "utf8"
  );
  await writeFile(
    path.join(tempDir, ".env.local"),
    "AUTH_SESSION_SECRET=SECRET_MUST_NOT_LEAK",
    "utf8"
  );
  await writeFile(
    path.join(tempDir, "node_modules", "secret.txt"),
    "NODE_MODULE_SECRET",
    "utf8"
  );
  await writeFile(
    path.join(tempDir, ".next", "secret.txt"),
    "NEXT_SECRET",
    "utf8"
  );

  const database = new Database(databasePath);
  database.exec(`
    create table workspaces (
      id text primary key,
      name text not null
    );
    create table storage_objects (
      id text primary key,
      workspace_id text not null,
      deleted_at text
    );
    insert into workspaces values ('wks_backup', 'Backup Test');
    insert into storage_objects values ('sto_backup', 'wks_backup', null);
  `);
  database.close();

  const result = await createLocalBackup({
    appVersion: "0.1.0-test",
    artifactsDirectory,
    createdAt: new Date("2026-06-19T15:16:17.000Z"),
    databasePath,
    storageRoot,
    workspaceId: "wks_backup"
  });
  const archiveEntries = unzip(["-Z1", result.outputPath])
    .trim()
    .split("\n")
    .map((entry) => entry.replace(/^\.\//, ""))
    .filter(Boolean);

  assert.equal(
    archiveEntries.some((entry) => entry === "database/fichr.sqlite"),
    true
  );
  assert.equal(
    archiveEntries.some(
      (entry) => entry === "storage/imports/wks_backup/source.csv"
    ),
    true
  );
  assert.equal(
    archiveEntries.some((entry) => entry === "backup-manifest.json"),
    true
  );
  assert.equal(archiveEntries.some((entry) => entry.includes(".env.local")), false);
  assert.equal(
    archiveEntries.some((entry) => entry.startsWith("node_modules/")),
    false
  );
  assert.equal(
    archiveEntries.some((entry) => entry.startsWith(".next/")),
    false
  );

  const manifest = JSON.parse(
    unzip(["-p", result.outputPath, "backup-manifest.json"])
  );
  assert.equal(manifest.requested_workspace_id, "wks_backup");
  assert.deepEqual(manifest.workspace_ids, ["wks_backup"]);
  assert.equal(manifest.includes_database, true);
  assert.equal(manifest.includes_storage, true);
  assert.equal(manifest.storage_objects_count, 1);
  assert.equal(manifest.file_count, 2);
  assert.equal(manifest.physical_file_count, 1);
  assert.equal(manifest.total_size_bytes > 0, true);
  assert.equal(
    manifest.per_file_checksums.every((file) => file.sha256.length === 64),
    true
  );
  assert.equal(manifest.database_file, "database/fichr.sqlite");
  assert.equal(manifest.storage_root, "storage");
  assert.equal(manifest.encrypted, false);
  assert.equal(verifyLocalBackupManifestHash(manifest), true);
  assert.match(result.warning, /Ne pas partager/);

  const backupDatabasePath = path.join(tempDir, "restored-check.sqlite");
  await writeFile(
    backupDatabasePath,
    unzipBuffer(["-p", result.outputPath, "database/fichr.sqlite"])
  );
  const backupDatabase = new Database(backupDatabasePath, {
    fileMustExist: true,
    readonly: true
  });
  assert.equal(
    backupDatabase
      .prepare("select name from workspaces where id = 'wks_backup'")
      .get().name,
    "Backup Test"
  );
  backupDatabase.close();

  const serializedArchive = await readFile(result.outputPath);
  assert.equal(
    serializedArchive.includes(Buffer.from("SECRET_MUST_NOT_LEAK")),
    false
  );
  assert.equal(serializedArchive.includes(Buffer.from("NODE_MODULE_SECRET")), false);
  assert.equal(serializedArchive.includes(Buffer.from("NEXT_SECRET")), false);

  const backupScriptSource = await readFile("scripts/backup-local.mjs", "utf8");
  const archiveSource = await readFile("scripts/archive-clean.mjs", "utf8");
  assert.match(backupScriptSource, /console\.warn/);
  assert.match(archiveSource, /"storage"/);
  assert.match(archiveSource, /sqlite/);
  assert.equal(
    `${backupScriptSource}\n${await readFile(
      "scripts/local-backup-core.mjs",
      "utf8"
    )}`.includes("fetch("),
    false
  );
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

console.log("Local backup coverage passed.");
