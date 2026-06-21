import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

import { createLocalBackupManifest } from "../src/server/storage/backup.ts";

async function copyStorageDirectory(source, destination, warnings) {
  let entries;

  try {
    entries = await readdir(source, { withFileTypes: true });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      await mkdir(destination, { recursive: true });
      warnings.push("Le dossier storage source était absent.");
      return;
    }

    throw error;
  }

  await mkdir(destination, { recursive: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      await copyStorageDirectory(sourcePath, destinationPath, warnings);
    } else if (entry.isFile()) {
      await copyFile(sourcePath, destinationPath);
    } else {
      warnings.push(`Entrée storage ignorée : ${entry.name}`);
    }
  }
}

async function collectFileChecksums(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const targetPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFileChecksums(root, targetPath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const content = await readFile(targetPath);
    const fileStat = await stat(targetPath);

    files.push({
      path: path.relative(root, targetPath).replaceAll(path.sep, "/"),
      sha256: createHash("sha256").update(content).digest("hex"),
      size_bytes: fileStat.size
    });
  }

  return files;
}

function createTimestamp(date) {
  return date
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(/\.\d{3}Z$/, "Z")
    .replace("T", "-");
}

export async function createLocalBackup(input) {
  const createdAt = input.createdAt ?? new Date();
  const backupId = `bkp_${randomUUID().replaceAll("-", "")}`;
  const stagingRoot = await mkdtemp(
    path.join(tmpdir(), "fichr-private-backup-")
  );
  const databaseDirectory = path.join(stagingRoot, "database");
  const storageDestination = path.join(stagingRoot, "storage");
  const snapshotPath = path.join(databaseDirectory, "fichr.sqlite");
  const warnings = [
    "Cette archive contient des données utilisateur. Ne pas partager.",
    "Évitez toute écriture dans Fichr pendant la création de la sauvegarde."
  ];

  try {
    await mkdir(databaseDirectory, { recursive: true });
    const sourceDatabase = new Database(input.databasePath, {
      fileMustExist: true,
      readonly: true
    });
    let storageObjectsCount = 0;
    let workspaceIds = [];

    try {
      workspaceIds = sourceDatabase
        .prepare("select id from workspaces order by id asc")
        .all()
        .map((workspace) => workspace.id);
      const tableExists = sourceDatabase
        .prepare(
          "select name from sqlite_master where type = 'table' and name = 'storage_objects'"
        )
        .get();

      if (tableExists) {
        storageObjectsCount = sourceDatabase
          .prepare(
            "select count(*) as count from storage_objects where deleted_at is null"
          )
          .get().count;
      }

      if (workspaceIds.length > 1) {
        warnings.push(
          `La SQLite locale contient ${workspaceIds.length} workspaces : le snapshot les inclut tous.`
        );
      }

      await sourceDatabase.backup(snapshotPath);
    } finally {
      sourceDatabase.close();
    }

    await copyStorageDirectory(
      input.storageRoot,
      storageDestination,
      warnings
    );
    const checkedFiles = await collectFileChecksums(stagingRoot);
    const manifest = createLocalBackupManifest({
      appVersion: input.appVersion,
      backupId,
      checkedFiles,
      createdAt: createdAt.toISOString(),
      requestedWorkspaceId: input.workspaceId,
      storageObjectsCount,
      warnings,
      workspaceIds
    });

    await writeFile(
      path.join(stagingRoot, "backup-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    );
    await mkdir(input.artifactsDirectory, { recursive: true });
    const outputPath = path.join(
      input.artifactsDirectory,
      `fichr-backup-${createTimestamp(createdAt)}-${backupId.slice(-8)}.zip`
    );
    const archive = spawnSync("zip", ["-q", "-r", outputPath, "."], {
      cwd: stagingRoot,
      encoding: "utf8"
    });

    if (archive.status !== 0) {
      throw new Error(
        archive.stderr?.trim() || "La commande zip n’est pas disponible."
      );
    }

    return { manifest, outputPath, warning: warnings[0] };
  } finally {
    await rm(stagingRoot, { force: true, recursive: true });
  }
}
