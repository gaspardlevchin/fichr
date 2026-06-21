import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
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
  parseEncryptedBackupEnvelope
} from "../src/server/storage/encrypted-backup.ts";
import { verifyBackupFile } from "./backup-verification-core.mjs";
import { createEncryptedLocalBackup } from "./encrypted-local-backup-core.mjs";
import { createLocalBackup } from "./local-backup-core.mjs";

function runBackupLocal(args, env) {
  return spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "scripts/backup-local.mjs",
      ...args
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, ...env }
    }
  );
}

function runBackupVerify(archivePath, backupPassphrase) {
  const env = { ...process.env };

  if (backupPassphrase === undefined) {
    delete env.BACKUP_PASSPHRASE;
  } else {
    env.BACKUP_PASSPHRASE = backupPassphrase;
  }

  return spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "scripts/backup-verify.mjs",
      "--file",
      archivePath
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env
    }
  );
}

async function listControlledTemporaryDirectories() {
  return new Set(
    (await readdir(tmpdir())).filter(
      (entry) =>
        entry.startsWith("fichr-encrypted-backup-") ||
        entry.startsWith("fichr-backup-verification-")
    )
  );
}

function assertNoNewTemporaryDirectories(before, after) {
  assert.deepEqual(
    [...after].filter((entry) => !before.has(entry)),
    []
  );
}

const tempDir = await mkdtemp(path.join(tmpdir(), "fichr-encrypted-test-"));
const databasePath = path.join(tempDir, "source.sqlite");
const storageRoot = path.join(tempDir, "storage");
const artifactsDirectory = path.join(tempDir, "artifacts");
const activeMarker = path.join(tempDir, "active-marker.txt");
const passphrase = "correct horse battery staple";
const storageSentinel = "ENCRYPTED_STORAGE_SENTINEL";

try {
  await mkdir(path.join(storageRoot, "imports", "wks_encrypted"), {
    recursive: true
  });
  await writeFile(
    path.join(
      storageRoot,
      "imports",
      "wks_encrypted",
      "private.csv"
    ),
    storageSentinel,
    "utf8"
  );
  await writeFile(activeMarker, "ACTIVE_UNCHANGED", "utf8");

  const database = new Database(databasePath);
  database.exec(`
    create table workspaces (
      id text primary key,
      name text not null,
      created_at text not null default CURRENT_TIMESTAMP
    );
    create table storage_objects (
      id text primary key,
      deleted_at text
    );
    insert into workspaces (id, name) values ('wks_encrypted', 'Encrypted');
    insert into storage_objects values ('sto_encrypted', null);
  `);
  database.close();

  const env = {
    DATABASE_URL: `file:${databasePath}`,
    LOCAL_STORAGE_ROOT: storageRoot
  };
  const withoutPassphrase = runBackupLocal(
    ["--workspace", "wks_encrypted", "--encrypt"],
    {
      ...env,
      BACKUP_PASSPHRASE: ""
    }
  );
  assert.notEqual(withoutPassphrase.status, 0);
  assert.match(withoutPassphrase.stderr, /passphrase requise/i);

  const shortPassphrase = "short";
  const withShortPassphrase = runBackupLocal(
    ["--workspace", "wks_encrypted", "--encrypt"],
    {
      ...env,
      BACKUP_PASSPHRASE: shortPassphrase
    }
  );
  assert.notEqual(withShortPassphrase.status, 0);
  assert.match(withShortPassphrase.stderr, /au moins 12/);
  assert.equal(
    `${withShortPassphrase.stdout}${withShortPassphrase.stderr}`.includes(
      shortPassphrase
    ),
    false
  );

  const temporaryDirectoriesBefore =
    await listControlledTemporaryDirectories();
  const encrypted = await createEncryptedLocalBackup({
    appVersion: "0.1.0-test",
    artifactsDirectory,
    createdAt: new Date("2026-06-19T18:00:00.000Z"),
    databasePath,
    passphrase,
    storageRoot,
    workspaceId: "wks_encrypted"
  });
  const temporaryDirectoriesAfterCreation =
    await listControlledTemporaryDirectories();
  assertNoNewTemporaryDirectories(
    temporaryDirectoriesBefore,
    temporaryDirectoriesAfterCreation,
  );
  assert.equal(encrypted.outputPath.endsWith(".fichrbackup"), true);
  assert.deepEqual(await readdir(artifactsDirectory), [
    path.basename(encrypted.outputPath)
  ]);

  const blockedArtifactsPath = path.join(tempDir, "blocked-artifacts");
  await writeFile(blockedArtifactsPath, "NOT_A_DIRECTORY", "utf8");
  await assert.rejects(() =>
    createEncryptedLocalBackup({
      appVersion: "0.1.0-test",
      artifactsDirectory: blockedArtifactsPath,
      createdAt: new Date("2026-06-19T18:05:00.000Z"),
      databasePath,
      passphrase,
      storageRoot,
      workspaceId: "wks_encrypted"
    })
  );
  assertNoNewTemporaryDirectories(
    temporaryDirectoriesBefore,
    await listControlledTemporaryDirectories(),
  );

  const encryptedContent = await readFile(encrypted.outputPath);
  const encryptedText = encryptedContent.toString("utf8");
  const envelope = parseEncryptedBackupEnvelope(encryptedContent);
  assert.equal(envelope.encryption_algorithm, "aes-256-gcm");
  assert.equal(envelope.kdf.name, "scrypt");
  assert.equal(envelope.kdf.N, 32768);
  assert.equal(encryptedText.includes("SQLite format 3"), false);
  assert.equal(encryptedText.includes(storageSentinel), false);
  assert.equal(encryptedText.includes("database/fichr.sqlite"), false);
  assert.equal(encryptedText.includes("storage/imports"), false);
  assert.equal(encryptedText.includes("wks_encrypted"), false);
  assert.equal(encryptedText.includes(passphrase), false);
  assert.equal(encryptedText.includes(".env.local"), false);

  const cliWithoutPassphrase = runBackupVerify(encrypted.outputPath);
  assert.equal(cliWithoutPassphrase.status, 0);
  assert.match(cliWithoutPassphrase.stdout, /passphrase requise/i);
  assert.match(cliWithoutPassphrase.stdout, /Aucune restauration/);

  const cliWithPassphrase = runBackupVerify(
    encrypted.outputPath,
    passphrase
  );
  assert.equal(cliWithPassphrase.status, 0);
  assert.match(cliWithPassphrase.stdout, /Backup Fichr vérifié/);
  assert.match(cliWithPassphrase.stdout, /AES-256-GCM/);
  assert.equal(
    `${cliWithPassphrase.stdout}${cliWithPassphrase.stderr}`.includes(
      passphrase
    ),
    false
  );

  const wrongPassphrase = "wrong passphrase value";
  const cliWithWrongPassphrase = runBackupVerify(
    encrypted.outputPath,
    wrongPassphrase
  );
  assert.notEqual(cliWithWrongPassphrase.status, 0);
  assert.match(cliWithWrongPassphrase.stderr, /incorrecte|altéré/i);
  assert.equal(
    `${cliWithWrongPassphrase.stdout}${cliWithWrongPassphrase.stderr}`.includes(
      wrongPassphrase
    ),
    false
  );

  const withoutVerificationPassphrase = await verifyBackupFile({
    archivePath: encrypted.outputPath
  });
  assert.equal(withoutVerificationPassphrase.encrypted, true);
  assert.equal(withoutVerificationPassphrase.passphraseRequired, true);

  const verified = await verifyBackupFile({
    archivePath: encrypted.outputPath,
    passphrase
  });
  assert.equal(verified.encrypted, true);
  assert.equal(verified.passphraseRequired, false);
  assert.equal(verified.manifest.requested_workspace_id, "wks_encrypted");

  await assert.rejects(
    () =>
      verifyBackupFile({
        archivePath: encrypted.outputPath,
        passphrase: wrongPassphrase
      }),
    (error) => error instanceof InvalidBackupPassphraseError
  );
  const temporaryDirectoriesAfterVerification =
    await listControlledTemporaryDirectories();
  assertNoNewTemporaryDirectories(
    temporaryDirectoriesBefore,
    temporaryDirectoriesAfterVerification,
  );
  assert.equal(await readFile(activeMarker, "utf8"), "ACTIVE_UNCHANGED");

  const plainArtifactsDirectory = path.join(tempDir, "plain-artifacts");
  const plain = await createLocalBackup({
    appVersion: "0.1.0-test",
    artifactsDirectory: plainArtifactsDirectory,
    createdAt: new Date("2026-06-19T18:10:00.000Z"),
    databasePath,
    storageRoot,
    workspaceId: "wks_encrypted"
  });
  const plainVerified = await verifyBackupFile({
    archivePath: plain.outputPath
  });
  assert.equal(plainVerified.encrypted, false);
  assert.equal(plainVerified.passphraseRequired, false);

  const sources = `${await readFile(
    "scripts/backup-local.mjs",
    "utf8"
  )}\n${await readFile(
    "scripts/encrypted-local-backup-core.mjs",
    "utf8"
  )}\n${await readFile(
    "src/server/storage/encrypted-backup.ts",
    "utf8"
  )}`;
  assert.equal(/console\.(log|warn|error)\([^)]*passphrase/i.test(sources), false);
  assert.equal(sources.includes("fetch("), false);
  assert.equal(
    /googleapis|dropbox|onedrive|icloud|s3|webdav|openai/i.test(sources),
    false
  );
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

console.log("Encrypted backup coverage passed.");
