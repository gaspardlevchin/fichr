import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

import {
  InvalidBackupPassphraseError,
  encryptBackupBuffer
} from "../src/server/storage/encrypted-backup.ts";
import { runBackupRestorePreflight } from "./backup-restore-preflight-core.mjs";
import { createEncryptedLocalBackup } from "./encrypted-local-backup-core.mjs";
import { createLocalBackup } from "./local-backup-core.mjs";
import { restorePreflightTempPrefix } from "./secure-temp-dir.mjs";

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

function runPreflightCli(input) {
  const env = {
    ...process.env,
    DATABASE_URL: `file:${input.currentDatabasePath}`,
    LOCAL_STORAGE_ROOT: input.currentStorageRoot
  };

  if (input.passphrase === undefined) {
    delete env.BACKUP_PASSPHRASE;
  } else {
    env.BACKUP_PASSPHRASE = input.passphrase;
  }

  return spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "scripts/backup-restore-preflight.mjs",
      "--file",
      input.archivePath
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env
    }
  );
}

async function listPreflightTemporaryDirectories() {
  return new Set(
    (await readdir(tmpdir())).filter((entry) =>
      entry.startsWith(restorePreflightTempPrefix)
    )
  );
}

function assertNoNewTemporaryDirectories(before, after) {
  assert.deepEqual(
    [...after].filter((entry) => !before.has(entry)),
    []
  );
}

function hash(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function createInvalidVariant(input) {
  const variantRoot = path.join(input.tempDir, input.name);
  await cp(input.extractedRoot, variantRoot, { recursive: true });
  await input.mutate(variantRoot);
  const archivePath = path.join(input.tempDir, `${input.name}.zip`);
  createZip(variantRoot, archivePath);

  return archivePath;
}

const tempDir = await mkdtemp(
  path.join(tmpdir(), "fichr-restore-preflight-test-")
);
const sourceDatabasePath = path.join(tempDir, "source.sqlite");
const sourceStorageRoot = path.join(tempDir, "source-storage");
const activeDatabasePath = path.join(tempDir, "active.sqlite");
const activeStorageRoot = path.join(tempDir, "active-storage");
const artifactsDirectory = path.join(tempDir, "artifacts");
const passphrase = "restore preflight passphrase";
const wrongPassphrase = "incorrect restore phrase";
const activeStorageMarker = path.join(
  activeStorageRoot,
  "imports",
  "wks_restore",
  "active.csv"
);

try {
  await mkdir(path.dirname(activeStorageMarker), { recursive: true });
  await mkdir(
    path.join(sourceStorageRoot, "imports", "wks_restore"),
    { recursive: true }
  );
  await mkdir(
    path.join(sourceStorageRoot, "exports", "wks_new"),
    { recursive: true }
  );
  await writeFile(activeStorageMarker, "ACTIVE_STORAGE_UNCHANGED", "utf8");
  await writeFile(
    path.join(sourceStorageRoot, "imports", "wks_restore", "source.csv"),
    "title\nBackup source",
    "utf8"
  );
  await writeFile(
    path.join(sourceStorageRoot, "exports", "wks_new", "source.txt"),
    "backup export",
    "utf8"
  );

  const sourceDatabase = new Database(sourceDatabasePath);
  sourceDatabase.exec(`
    create table workspaces (
      id text primary key,
      name text not null,
      created_at text not null default CURRENT_TIMESTAMP
    );
    create table storage_objects (
      id text primary key,
      deleted_at text
    );
    insert into workspaces (id, name) values
      ('wks_new', 'New workspace'),
      ('wks_restore', 'Existing workspace');
    insert into storage_objects values ('sto_source', null);
  `);
  sourceDatabase.close();

  const activeDatabase = new Database(activeDatabasePath);
  activeDatabase.exec(`
    create table workspaces (
      id text primary key,
      name text not null
    );
    insert into workspaces values ('wks_restore', 'Active workspace');
  `);
  activeDatabase.close();

  const activeDatabaseBefore = await readFile(activeDatabasePath);
  const activeStorageBefore = await readFile(activeStorageMarker);
  const temporaryDirectoriesBefore =
    await listPreflightTemporaryDirectories();
  const plain = await createLocalBackup({
    appVersion: "0.0.9-test",
    artifactsDirectory,
    createdAt: new Date("2026-06-19T20:00:00.000Z"),
    databasePath: sourceDatabasePath,
    storageRoot: sourceStorageRoot,
    workspaceId: "wks_restore"
  });
  const encrypted = await createEncryptedLocalBackup({
    appVersion: "0.1.0",
    artifactsDirectory,
    createdAt: new Date("2026-06-19T20:05:00.000Z"),
    databasePath: sourceDatabasePath,
    passphrase,
    storageRoot: sourceStorageRoot,
    workspaceId: "wks_restore"
  });
  const commonInput = {
    currentAppVersion: "0.1.0",
    currentDatabasePath: activeDatabasePath,
    currentStorageRoot: activeStorageRoot,
    now: new Date("2026-06-19T21:00:00.000Z")
  };

  const plainReport = await runBackupRestorePreflight({
    ...commonInput,
    archivePath: plain.outputPath
  });
  assert.equal(plainReport.status, "restorable_with_warnings");
  assert.equal(plainReport.encrypted, false);
  assert.equal(plainReport.backupDatabasePresent, true);
  assert.equal(plainReport.storagePresent, true);
  assert.equal(plainReport.checksumsValid, true);
  assert.equal(plainReport.compatibility, "probable");
  assert.deepEqual(plainReport.workspaceIds, ["wks_new", "wks_restore"]);
  assert.deepEqual(plainReport.existingWorkspaceIds, ["wks_restore"]);
  assert.deepEqual(plainReport.newWorkspaceIds, ["wks_new"]);
  assert.equal(
    plainReport.warnings.some((warning) => /pas chiffré/i.test(warning)),
    true
  );
  assert.equal(
    plainReport.warnings.some((warning) => /workspace déjà présent/i.test(warning)),
    true
  );
  assert.equal(
    plainReport.warnings.some((warning) => /workspace absent/i.test(warning)),
    true
  );
  assert.equal(
    plainReport.warnings.some((warning) => /Version différente/i.test(warning)),
    true
  );
  assert.equal(
    plainReport.currentInstallation.storageConflicts.some(
      (conflict) =>
        conflict.workspace_id === "wks_restore" &&
        conflict.namespaces.includes("imports")
    ),
    true
  );

  const encryptedWithoutPassphrase = await runBackupRestorePreflight({
    ...commonInput,
    archivePath: encrypted.outputPath
  });
  assert.equal(encryptedWithoutPassphrase.passphraseRequired, true);
  assert.equal(encryptedWithoutPassphrase.status, "not_restorable");

  const encryptedReport = await runBackupRestorePreflight({
    ...commonInput,
    archivePath: encrypted.outputPath,
    passphrase
  });
  assert.equal(encryptedReport.encrypted, true);
  assert.equal(encryptedReport.checksumsValid, true);
  assert.equal(encryptedReport.status, "restorable_with_warnings");

  await assert.rejects(
    () =>
      runBackupRestorePreflight({
        ...commonInput,
        archivePath: encrypted.outputPath,
        passphrase: wrongPassphrase
      }),
    (error) => error instanceof InvalidBackupPassphraseError
  );

  const cliWithoutPassphrase = runPreflightCli({
    archivePath: encrypted.outputPath,
    currentDatabasePath: activeDatabasePath,
    currentStorageRoot: activeStorageRoot
  });
  assert.equal(cliWithoutPassphrase.status, 0);
  assert.match(
    `${cliWithoutPassphrase.stdout}${cliWithoutPassphrase.stderr}`,
    /passphrase requise/i
  );
  assert.match(cliWithoutPassphrase.stdout, /Aucune restauration/);

  const cliWithPassphrase = runPreflightCli({
    archivePath: encrypted.outputPath,
    currentDatabasePath: activeDatabasePath,
    currentStorageRoot: activeStorageRoot,
    passphrase
  });
  assert.equal(cliWithPassphrase.status, 0);
  assert.match(cliWithPassphrase.stdout, /restorable_with_warnings/);
  assert.match(cliWithPassphrase.stdout, /Checksums : valides/);
  assert.equal(
    `${cliWithPassphrase.stdout}${cliWithPassphrase.stderr}`.includes(
      passphrase
    ),
    false
  );

  const cliWithWrongPassphrase = runPreflightCli({
    archivePath: encrypted.outputPath,
    currentDatabasePath: activeDatabasePath,
    currentStorageRoot: activeStorageRoot,
    passphrase: wrongPassphrase
  });
  assert.notEqual(cliWithWrongPassphrase.status, 0);
  assert.match(cliWithWrongPassphrase.stderr, /incorrecte|altéré/i);
  assert.equal(
    `${cliWithWrongPassphrase.stdout}${cliWithWrongPassphrase.stderr}`.includes(
      wrongPassphrase
    ),
    false
  );

  const extractedRoot = path.join(tempDir, "valid-extracted");
  await mkdir(extractedRoot, { recursive: true });
  run("unzip", ["-q", plain.outputPath, "-d", extractedRoot]);

  const malformedArchive = path.join(tempDir, "malformed.zip");
  await writeFile(malformedArchive, "NOT_A_ZIP", "utf8");
  const malformedReport = await runBackupRestorePreflight({
    ...commonInput,
    archivePath: malformedArchive
  });
  assert.equal(malformedReport.status, "not_restorable");

  const missingManifest = await createInvalidVariant({
    extractedRoot,
    mutate: (root) => rm(path.join(root, "backup-manifest.json")),
    name: "missing-manifest",
    tempDir
  });
  assert.match(
    (
      await runBackupRestorePreflight({
        ...commonInput,
        archivePath: missingManifest
      })
    ).errors.join(" "),
    /manifest/i
  );

  const missingDatabase = await createInvalidVariant({
    extractedRoot,
    mutate: (root) =>
      rm(path.join(root, "database"), { force: true, recursive: true }),
    name: "missing-database",
    tempDir
  });
  assert.match(
    (
      await runBackupRestorePreflight({
        ...commonInput,
        archivePath: missingDatabase
      })
    ).errors.join(" "),
    /SQLite.*absente/i
  );

  const missingStorage = await createInvalidVariant({
    extractedRoot,
    mutate: (root) =>
      rm(path.join(root, "storage"), { force: true, recursive: true }),
    name: "missing-storage",
    tempDir
  });
  assert.match(
    (
      await runBackupRestorePreflight({
        ...commonInput,
        archivePath: missingStorage
      })
    ).errors.join(" "),
    /storage.*absent/i
  );

  for (const forbiddenPath of [
    ".env.local",
    "node_modules/package.txt",
    ".next/build.txt"
  ]) {
    const forbiddenArchive = await createInvalidVariant({
      extractedRoot,
      mutate: async (root) => {
        const targetPath = path.join(root, forbiddenPath);
        await mkdir(path.dirname(targetPath), { recursive: true });
        await writeFile(targetPath, "FORBIDDEN", "utf8");
      },
      name: `forbidden-${forbiddenPath.replaceAll("/", "-")}`,
      tempDir
    });
    const report = await runBackupRestorePreflight({
      ...commonInput,
      archivePath: forbiddenArchive
    });
    assert.equal(report.status, "not_restorable");
    assert.match(report.errors.join(" "), /sensible|interdit/i);
  }

  const tamperedArchive = await createInvalidVariant({
    extractedRoot,
    mutate: (root) =>
      writeFile(
        path.join(
          root,
          "storage",
          "imports",
          "wks_restore",
          "source.csv"
        ),
        "TAMPERED",
        "utf8"
      ),
    name: "tampered-checksum",
    tempDir
  });
  const tamperedReport = await runBackupRestorePreflight({
    ...commonInput,
    archivePath: tamperedArchive
  });
  assert.equal(tamperedReport.status, "not_restorable");
  assert.match(tamperedReport.errors.join(" "), /Taille invalide|Checksum invalide/);
  assert.deepEqual(tamperedReport.invalidFiles, [
    "storage/imports/wks_restore/source.csv"
  ]);

  const invalidEncryptedZip = await readFile(missingManifest);
  const invalidEncryptedEnvelope = await encryptBackupBuffer({
    content: invalidEncryptedZip,
    createdAt: "2026-06-19T20:10:00.000Z",
    passphrase
  });
  const invalidEncryptedPath = path.join(
    tempDir,
    "invalid-inner.fichrbackup"
  );
  await writeFile(
    invalidEncryptedPath,
    `${JSON.stringify(invalidEncryptedEnvelope)}\n`,
    "utf8"
  );
  const invalidEncryptedReport = await runBackupRestorePreflight({
    ...commonInput,
    archivePath: invalidEncryptedPath,
    passphrase
  });
  assert.equal(invalidEncryptedReport.status, "not_restorable");
  assert.match(invalidEncryptedReport.errors.join(" "), /manifest/i);

  const alteredEnvelope = JSON.parse(
    await readFile(encrypted.outputPath, "utf8")
  );
  alteredEnvelope.ciphertext =
    `${alteredEnvelope.ciphertext[0] === "A" ? "B" : "A"}` +
    alteredEnvelope.ciphertext.slice(1);
  const alteredEncryptedPath = path.join(tempDir, "altered.fichrbackup");
  await writeFile(
    alteredEncryptedPath,
    `${JSON.stringify(alteredEnvelope)}\n`,
    "utf8"
  );
  await assert.rejects(
    () =>
      runBackupRestorePreflight({
        ...commonInput,
        archivePath: alteredEncryptedPath,
        passphrase
      }),
    (error) => error instanceof InvalidBackupPassphraseError
  );

  assert.equal(
    hash(await readFile(activeDatabasePath)),
    hash(activeDatabaseBefore)
  );
  assert.equal(
    hash(await readFile(activeStorageMarker)),
    hash(activeStorageBefore)
  );
  assertNoNewTemporaryDirectories(
    temporaryDirectoriesBefore,
    await listPreflightTemporaryDirectories()
  );

  const sources = `${await readFile(
    "scripts/backup-restore-preflight.mjs",
    "utf8"
  )}\n${await readFile(
    "scripts/backup-restore-preflight-core.mjs",
    "utf8"
  )}\n${await readFile("scripts/secure-temp-dir.mjs", "utf8")}`;
  assert.equal(/console\.(log|warn|error)\([^)]*passphrase/i.test(sources), false);
  assert.equal(sources.includes("fetch("), false);
  assert.equal(
    /googleapis|dropbox|onedrive|icloud|s3|webdav|openai/i.test(sources),
    false
  );
  assert.equal(sources.includes("backup:restore --"), false);
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

console.log("Backup restore preflight coverage passed.");
