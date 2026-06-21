import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  assertValidBackupPassphrase,
  encryptBackupBuffer
} from "../src/server/storage/encrypted-backup.ts";
import { createLocalBackup } from "./local-backup-core.mjs";

export async function createEncryptedLocalBackup(input) {
  assertValidBackupPassphrase(input.passphrase);
  const temporaryArtifactsDirectory = await mkdtemp(
    path.join(tmpdir(), "fichr-encrypted-backup-")
  );

  try {
    const plainBackup = await createLocalBackup({
      ...input,
      artifactsDirectory: temporaryArtifactsDirectory
    });
    const plainContent = await readFile(plainBackup.outputPath);
    const envelope = await encryptBackupBuffer({
      content: plainContent,
      createdAt: plainBackup.manifest.created_at,
      passphrase: input.passphrase
    });
    const basename = path
      .basename(plainBackup.outputPath, ".zip")
      .concat(".fichrbackup");
    await mkdir(input.artifactsDirectory, { recursive: true });
    const outputPath = path.join(input.artifactsDirectory, basename);

    await writeFile(
      outputPath,
      `${JSON.stringify(envelope)}\n`,
      {
        flag: "wx",
        mode: 0o600
      }
    );

    return {
      encrypted: true,
      manifest: plainBackup.manifest,
      outputPath,
      warning:
        "Backup chiffré créé. Fichr ne peut pas récupérer une passphrase perdue."
    };
  } finally {
    await rm(temporaryArtifactsDirectory, {
      force: true,
      recursive: true
    });
  }
}

