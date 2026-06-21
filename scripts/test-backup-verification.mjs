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

import { createLocalBackup } from "./local-backup-core.mjs";
import { verifyLocalBackupArchive } from "./backup-verification-core.mjs";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} failed`);
  }

  return result.stdout;
}

function createZip(root, outputPath) {
  run("zip", ["-q", "-r", outputPath, "."], { cwd: root });
}

async function expectInvalid(archivePath, pattern) {
  assert.throws(() => verifyLocalBackupArchive(archivePath), pattern);
}

const tempDir = await mkdtemp(
  path.join(tmpdir(), "fichr-backup-verification-")
);
const databasePath = path.join(tempDir, "source.sqlite");
const storageRoot = path.join(tempDir, "storage-source");
const artifactsDirectory = path.join(tempDir, "artifacts");
const activeMarker = path.join(tempDir, "active-marker.txt");

try {
  await mkdir(path.join(storageRoot, "exports", "wks_verify"), {
    recursive: true
  });
  await writeFile(
    path.join(storageRoot, "exports", "wks_verify", "verified.txt"),
    "verified-content",
    "utf8"
  );
  await writeFile(activeMarker, "ACTIVE_UNCHANGED", "utf8");

  const database = new Database(databasePath);
  database.exec(`
    create table workspaces (
      id text primary key
    );
    create table storage_objects (
      id text primary key,
      deleted_at text
    );
    insert into workspaces values ('wks_verify'), ('wks_other');
    insert into storage_objects values ('sto_verify', null);
  `);
  database.close();

  const valid = await createLocalBackup({
    appVersion: "0.1.0-test",
    artifactsDirectory,
    createdAt: new Date("2026-06-19T17:00:00.000Z"),
    databasePath,
    storageRoot,
    workspaceId: "wks_verify"
  });
  const validReport = verifyLocalBackupArchive(valid.outputPath);
  assert.equal(validReport.manifest.encrypted, false);
  assert.deepEqual(validReport.workspaceIds, ["wks_other", "wks_verify"]);
  assert.equal(
    validReport.warnings.some((warning) => /2 workspaces/.test(warning)),
    true
  );

  const missingManifestRoot = path.join(tempDir, "missing-manifest");
  await mkdir(path.join(missingManifestRoot, "database"), { recursive: true });
  await mkdir(path.join(missingManifestRoot, "storage"), { recursive: true });
  await writeFile(
    path.join(missingManifestRoot, "database", "fichr.sqlite"),
    "db",
    "utf8"
  );
  const missingManifestZip = path.join(tempDir, "missing-manifest.zip");
  createZip(missingManifestRoot, missingManifestZip);
  await expectInvalid(missingManifestZip, /manifest/i);

  const extractedRoot = path.join(tempDir, "extracted-valid");
  await mkdir(extractedRoot, { recursive: true });
  run("unzip", ["-q", valid.outputPath, "-d", extractedRoot]);

  const missingDatabaseRoot = path.join(tempDir, "missing-database");
  run("cp", ["-R", extractedRoot, missingDatabaseRoot]);
  await rm(path.join(missingDatabaseRoot, "database"), {
    force: true,
    recursive: true
  });
  const missingDatabaseZip = path.join(tempDir, "missing-database.zip");
  createZip(missingDatabaseRoot, missingDatabaseZip);
  await expectInvalid(missingDatabaseZip, /SQLite.*absente/i);

  const missingStorageRoot = path.join(tempDir, "missing-storage");
  run("cp", ["-R", extractedRoot, missingStorageRoot]);
  await rm(path.join(missingStorageRoot, "storage"), {
    force: true,
    recursive: true
  });
  const missingStorageZip = path.join(tempDir, "missing-storage.zip");
  createZip(missingStorageRoot, missingStorageZip);
  await expectInvalid(missingStorageZip, /storage.*absent/i);

  for (const forbiddenPath of [
    ".env.local",
    "node_modules/package.txt",
    ".next/build.txt"
  ]) {
    const forbiddenRoot = path.join(
      tempDir,
      `forbidden-${forbiddenPath.replaceAll("/", "-")}`
    );
    run("cp", ["-R", extractedRoot, forbiddenRoot]);
    const targetPath = path.join(forbiddenRoot, forbiddenPath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, "MUST_BE_REFUSED", "utf8");
    const forbiddenZip = `${forbiddenRoot}.zip`;
    createZip(forbiddenRoot, forbiddenZip);
    await expectInvalid(forbiddenZip, /sensible|interdit/i);
  }

  const tamperedRoot = path.join(tempDir, "tampered");
  run("cp", ["-R", extractedRoot, tamperedRoot]);
  await writeFile(
    path.join(
      tamperedRoot,
      "storage",
      "exports",
      "wks_verify",
      "verified.txt"
    ),
    "tampered-content",
    "utf8"
  );
  const tamperedZip = path.join(tempDir, "tampered.zip");
  createZip(tamperedRoot, tamperedZip);
  await expectInvalid(tamperedZip, /Taille invalide|Checksum invalide/);

  assert.equal(await readFile(activeMarker, "utf8"), "ACTIVE_UNCHANGED");
  const verificationSources = `${await readFile(
    "scripts/backup-verify.mjs",
    "utf8"
  )}\n${await readFile("scripts/backup-verification-core.mjs", "utf8")}`;
  assert.equal(
    /better-sqlite3|DATABASE_URL|LOCAL_STORAGE_ROOT|db\/fichr\.sqlite/.test(
      verificationSources
    ),
    false
  );
  assert.match(verificationSources, /fichr-backup-verification-/);
  assert.equal(verificationSources.includes("fetch("), false);
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

console.log("Backup verification coverage passed.");
