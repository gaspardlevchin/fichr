import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { validateLocalBackupManifest } from "../src/server/storage/backup.ts";
import {
  decryptBackupEnvelope,
  parseEncryptedBackupEnvelope
} from "../src/server/storage/encrypted-backup.ts";

function runUnzip(args, options = {}) {
  const result = spawnSync("unzip", args, {
    encoding: options.binary ? undefined : "utf8",
    maxBuffer: 64 * 1024 * 1024
  });

  if (result.status !== 0) {
    throw new Error(
      result.stderr?.toString("utf8").trim() ||
        result.stdout?.toString("utf8").trim() ||
        "Archive ZIP illisible."
    );
  }

  return result.stdout;
}

function normalizeArchivePath(entry) {
  return entry.replace(/^\.\//, "").replaceAll("\\", "/");
}

function assertSafeArchivePath(entry) {
  const normalized = normalizeArchivePath(entry);
  const segments = normalized.split("/").filter(Boolean);

  if (
    !normalized ||
    path.posix.isAbsolute(normalized) ||
    /^[a-zA-Z]:\//.test(normalized) ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error(`Chemin dangereux dans le backup : ${entry}`);
  }

  return normalized;
}

function isForbiddenBackupPath(entry) {
  const segments = entry.toLowerCase().split("/").filter(Boolean);
  const basename = segments.at(-1) ?? "";

  return (
    segments.includes("node_modules") ||
    segments.includes(".next") ||
    basename === ".env" ||
    basename.startsWith(".env.") ||
    basename === "credentials.json" ||
    basename === "secrets.json"
  );
}

function readArchiveEntry(archivePath, entry) {
  return runUnzip(["-p", archivePath, entry], { binary: true });
}

export function verifyLocalBackupArchive(archivePath) {
  const listedEntries = runUnzip(["-Z1", archivePath])
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(assertSafeArchivePath);
  const entries = new Set(listedEntries);

  if (listedEntries.some(isForbiddenBackupPath)) {
    throw new Error("Le backup contient un chemin sensible ou interdit.");
  }

  if (!entries.has("backup-manifest.json")) {
    throw new Error("backup-manifest.json est absent.");
  }

  if (!entries.has("database/fichr.sqlite")) {
    throw new Error("La base SQLite du backup est absente.");
  }

  if (
    !entries.has("storage/") &&
    !listedEntries.some((entry) => entry.startsWith("storage/"))
  ) {
    throw new Error("Le dossier storage du backup est absent.");
  }

  const manifest = validateLocalBackupManifest(
    JSON.parse(
      readArchiveEntry(archivePath, "backup-manifest.json").toString("utf8")
    )
  );
  const checksumPaths = manifest.per_file_checksums.map((file) =>
    assertSafeArchivePath(file.path)
  );
  const archiveDataFiles = listedEntries
    .filter((entry) => !entry.endsWith("/") && entry !== "backup-manifest.json")
    .sort();
  const expectedDataFiles = [...checksumPaths].sort();

  if (
    archiveDataFiles.length !== expectedDataFiles.length ||
    archiveDataFiles.some(
      (entry, index) => entry !== expectedDataFiles[index]
    )
  ) {
    throw new Error(
      "Les fichiers du backup ne correspondent pas au manifest."
    );
  }

  let totalSizeBytes = 0;
  let physicalFileCount = 0;

  for (const checksum of manifest.per_file_checksums) {
    if (!entries.has(checksum.path)) {
      throw new Error(`Fichier manquant dans le backup : ${checksum.path}`);
    }

    const content = readArchiveEntry(archivePath, checksum.path);
    const hash = createHash("sha256").update(content).digest("hex");

    if (content.byteLength !== checksum.size_bytes) {
      throw new Error(`Taille invalide : ${checksum.path}`);
    }

    if (hash !== checksum.sha256) {
      throw new Error(`Checksum invalide : ${checksum.path}`);
    }

    totalSizeBytes += content.byteLength;

    if (checksum.path.startsWith("storage/")) {
      physicalFileCount += 1;
    }
  }

  if (manifest.file_count !== manifest.per_file_checksums.length) {
    throw new Error("file_count ne correspond pas au manifest.");
  }

  if (manifest.total_size_bytes !== totalSizeBytes) {
    throw new Error("total_size_bytes ne correspond pas aux fichiers.");
  }

  if (manifest.physical_file_count !== physicalFileCount) {
    throw new Error(
      "physical_file_count ne correspond pas au contenu storage."
    );
  }

  const warnings = [...manifest.warnings];

  if (manifest.workspace_ids.length > 1) {
    warnings.push(
      `Le backup contient ${manifest.workspace_ids.length} workspaces.`
    );
  }

  return {
    backupId: manifest.backup_id,
    fileCount: manifest.file_count,
    manifest,
    totalSizeBytes,
    warnings,
    workspaceIds: manifest.workspace_ids
  };
}

export async function verifyBackupFile(input) {
  const extension = path.extname(input.archivePath).toLowerCase();

  if (extension === ".zip") {
    return {
      encrypted: false,
      passphraseRequired: false,
      ...verifyLocalBackupArchive(input.archivePath)
    };
  }

  if (extension !== ".fichrbackup") {
    throw new Error("Format de backup non pris en charge.");
  }

  const envelope = parseEncryptedBackupEnvelope(
    await readFile(input.archivePath)
  );

  if (!input.passphrase) {
    return {
      createdAt: envelope.created_at,
      encrypted: true,
      passphraseRequired: true,
      warnings: [envelope.warning]
    };
  }

  const decrypted = await decryptBackupEnvelope({
    envelope,
    passphrase: input.passphrase
  });

  if (
    decrypted.byteLength < 4 ||
    decrypted.subarray(0, 4).toString("hex") !== "504b0304"
  ) {
    throw new Error("Le contenu déchiffré n’est pas une archive ZIP valide.");
  }

  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "fichr-backup-verification-")
  );
  const temporaryArchivePath = path.join(
    temporaryDirectory,
    "decrypted-backup.zip"
  );

  try {
    await writeFile(temporaryArchivePath, decrypted, {
      flag: "wx",
      mode: 0o600
    });

    return {
      encrypted: true,
      passphraseRequired: false,
      ...verifyLocalBackupArchive(temporaryArchivePath)
    };
  } finally {
    decrypted.fill(0);
    await rm(temporaryDirectory, {
      force: true,
      recursive: true
    });
  }
}
