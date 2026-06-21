import { spawnSync } from "node:child_process";
import {
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";

import Database from "better-sqlite3";

import {
  BackupPassphraseRequiredError,
  InvalidBackupPassphraseError,
  decryptBackupEnvelope,
  parseEncryptedBackupEnvelope
} from "../src/server/storage/encrypted-backup.ts";
import { verifyLocalBackupArchive } from "./backup-verification-core.mjs";
import {
  cleanupTempDir,
  createSecureTempDir,
  ensureTempInsideAllowedRoot
} from "./secure-temp-dir.mjs";

const storageNamespaces = new Set([
  "attachments",
  "documents",
  "exports",
  "images",
  "imports"
]);
const backupAgeWarningDays = 90;

function runUnzip(args) {
  const result = spawnSync("unzip", args, {
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

function resolveInsideRoot(root, relativePath) {
  const resolvedRoot = path.resolve(root);
  const targetPath = path.resolve(resolvedRoot, relativePath);

  if (
    targetPath === resolvedRoot ||
    !targetPath.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error("Chemin d’extraction hors du dossier temporaire.");
  }

  return targetPath;
}

async function materializeVerifiedArchive(input) {
  const extractionRoot = resolveInsideRoot(
    input.temporaryDirectory,
    "extracted"
  );
  await mkdir(extractionRoot, { mode: 0o700, recursive: true });
  const paths = [
    "backup-manifest.json",
    ...input.manifest.per_file_checksums.map((file) => file.path)
  ];

  for (const archivePath of paths) {
    const targetPath = resolveInsideRoot(extractionRoot, archivePath);
    await mkdir(path.dirname(targetPath), {
      mode: 0o700,
      recursive: true
    });
    await writeFile(
      targetPath,
      runUnzip(["-p", input.archivePath, archivePath]),
      {
        flag: "wx",
        mode: 0o600
      }
    );
  }

  return extractionRoot;
}

function inspectBackupDatabase(databasePath) {
  const database = new Database(databasePath, {
    fileMustExist: true,
    readonly: true
  });

  try {
    database.pragma("query_only = ON");
    const integrityRows = database.pragma("integrity_check");
    const integrityValid =
      integrityRows.length === 1 && integrityRows[0]?.integrity_check === "ok";
    const workspaceTable = database
      .prepare(
        "select name from sqlite_master where type = 'table' and name = 'workspaces'"
      )
      .get();

    if (!workspaceTable) {
      throw new Error("La SQLite du backup ne contient pas la table workspaces.");
    }

    const workspaceIds = database
      .prepare("select id from workspaces order by id asc")
      .all()
      .map((workspace) => workspace.id);

    return {
      integrityValid,
      workspaceIds
    };
  } finally {
    database.close();
  }
}

async function inspectCurrentInstallation(databasePath) {
  let databaseSizeBytes = null;

  try {
    databaseSizeBytes = (await stat(databasePath)).size;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        databasePresent: false,
        databaseSizeBytes,
        inspectionWarning: "La SQLite active est absente.",
        workspaceIds: []
      };
    }

    throw error;
  }

  const database = new Database(databasePath, {
    fileMustExist: true,
    readonly: true
  });

  try {
    database.pragma("query_only = ON");
    const workspaceTable = database
      .prepare(
        "select name from sqlite_master where type = 'table' and name = 'workspaces'"
      )
      .get();

    if (!workspaceTable) {
      return {
        databasePresent: true,
        databaseSizeBytes,
        inspectionWarning:
          "La SQLite active ne contient pas la table workspaces.",
        workspaceIds: []
      };
    }

    return {
      databasePresent: true,
      databaseSizeBytes,
      inspectionWarning: null,
      workspaceIds: database
        .prepare("select id from workspaces order by id asc")
        .all()
        .map((workspace) => workspace.id)
    };
  } finally {
    database.close();
  }
}

function analyzeStoragePaths(manifest) {
  const legacyPaths = [];
  const namespacesByWorkspace = new Map();

  for (const file of manifest.per_file_checksums) {
    if (!file.path.startsWith("storage/")) {
      continue;
    }

    const segments = file.path.split("/");
    const basename = segments.at(-1);

    if (basename === ".gitkeep") {
      continue;
    }

    const namespace = segments[1];
    const workspaceId = segments[2];

    if (
      segments.length < 4 ||
      !storageNamespaces.has(namespace) ||
      !manifest.workspace_ids.includes(workspaceId)
    ) {
      legacyPaths.push(file.path);
      continue;
    }

    const namespaces =
      namespacesByWorkspace.get(workspaceId) ?? new Set();
    namespaces.add(namespace);
    namespacesByWorkspace.set(workspaceId, namespaces);
  }

  return {
    legacyPaths,
    namespacesByWorkspace
  };
}

async function inspectActiveStorage(input) {
  let storagePresent = true;

  try {
    await stat(input.storageRoot);
  } catch (error) {
    if (error?.code === "ENOENT") {
      storagePresent = false;
    } else {
      throw error;
    }
  }

  const conflicts = [];

  if (storagePresent) {
    for (const [workspaceId, namespaces] of input.namespacesByWorkspace) {
      const conflictingNamespaces = [];

      for (const namespace of namespaces) {
        const workspaceDirectory = path.join(
          input.storageRoot,
          namespace,
          workspaceId
        );

        try {
          const entries = await readdir(workspaceDirectory);

          if (entries.length > 0) {
            conflictingNamespaces.push(namespace);
          }
        } catch (error) {
          if (error?.code !== "ENOENT") {
            throw error;
          }
        }
      }

      if (conflictingNamespaces.length > 0) {
        conflicts.push({
          namespaces: conflictingNamespaces.sort(),
          workspace_id: workspaceId
        });
      }
    }
  }

  return {
    conflicts,
    storagePresent
  };
}

function createFailureReport(input) {
  return {
    appVersion: null,
    backupDatabasePresent: false,
    backupDatabaseSizeBytes: null,
    backupId: null,
    checksumsValid: false,
    compatibility: "unknown",
    createdAt: null,
    encrypted: input.encrypted,
    errors: [input.message],
    fileCount: 0,
    invalidFiles: input.invalidFiles ?? [],
    passphraseRequired: false,
    recommendation:
      "Ne restaurez pas ce backup. Corrigez les erreurs bloquantes puis relancez le preflight.",
    requestedWorkspaceId: null,
    status: "not_restorable",
    storagePresent: false,
    totalSizeBytes: 0,
    warnings: [],
    workspaceIds: []
  };
}

function extractInvalidFiles(message) {
  const match = message.match(
    /(?:Checksum invalide|Fichier manquant dans le backup|Taille invalide)\s*:\s*(.+)$/
  );

  return match ? [match[1]] : [];
}

function createPassphraseRequiredReport(createdAt) {
  return {
    createdAt,
    encrypted: true,
    errors: [],
    passphraseRequired: true,
    recommendation:
      "Relancez avec BACKUP_PASSPHRASE défini temporairement.",
    status: "not_restorable",
    warnings: ["Backup chiffré, passphrase requise."]
  };
}

function addAgeWarning(createdAt, warnings, now) {
  const createdTimestamp = Date.parse(createdAt);

  if (!Number.isFinite(createdTimestamp)) {
    throw new Error("La date de création du backup est invalide.");
  }

  const ageDays = Math.floor(
    (now.getTime() - createdTimestamp) / (24 * 60 * 60 * 1000)
  );

  if (ageDays > backupAgeWarningDays) {
    warnings.push(`Le backup date de ${ageDays} jours.`);
  }
}

export async function runBackupRestorePreflight(input) {
  const extension = path.extname(input.archivePath).toLowerCase();
  const encrypted = extension === ".fichrbackup";

  if (extension !== ".zip" && !encrypted) {
    return createFailureReport({
      encrypted: false,
      message: "Format de backup non pris en charge."
    });
  }

  let decrypted = null;
  let temporaryDirectory = null;

  try {
    let verifiedArchivePath = input.archivePath;

    if (encrypted) {
      let envelope;

      try {
        envelope = parseEncryptedBackupEnvelope(
          await readFile(input.archivePath)
        );
      } catch (error) {
        return createFailureReport({
          encrypted: true,
          message: error instanceof Error ? error.message : String(error)
        });
      }

      if (!input.passphrase) {
        return createPassphraseRequiredReport(envelope.created_at);
      }

      decrypted = await decryptBackupEnvelope({
        envelope,
        passphrase: input.passphrase
      });

      if (
        decrypted.byteLength < 4 ||
        decrypted.subarray(0, 4).toString("hex") !== "504b0304"
      ) {
        return createFailureReport({
          encrypted: true,
          message: "Le contenu déchiffré n’est pas une archive ZIP valide."
        });
      }

      temporaryDirectory = await createSecureTempDir();
      verifiedArchivePath = resolveInsideRoot(
        temporaryDirectory,
        "decrypted-backup.zip"
      );
      await writeFile(verifiedArchivePath, decrypted, {
        flag: "wx",
        mode: 0o600
      });
    }

    let verification;

    try {
      verification = verifyLocalBackupArchive(verifiedArchivePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return createFailureReport({
        encrypted,
        invalidFiles: extractInvalidFiles(message),
        message
      });
    }

    if (!temporaryDirectory) {
      temporaryDirectory = await createSecureTempDir();
    }

    ensureTempInsideAllowedRoot(temporaryDirectory);
    const extractionRoot = await materializeVerifiedArchive({
      archivePath: verifiedArchivePath,
      manifest: verification.manifest,
      temporaryDirectory
    });
    const backupDatabasePath = resolveInsideRoot(
      extractionRoot,
      verification.manifest.database_file
    );
    const backupDatabaseSizeBytes = (await stat(backupDatabasePath)).size;
    const backupDatabase = inspectBackupDatabase(backupDatabasePath);

    if (!backupDatabase.integrityValid) {
      return createFailureReport({
        encrypted,
        message: "La vérification d’intégrité SQLite du backup a échoué."
      });
    }

    if (
      backupDatabase.workspaceIds.length !==
        verification.manifest.workspace_ids.length ||
      backupDatabase.workspaceIds.some(
        (workspaceId, index) =>
          workspaceId !== verification.manifest.workspace_ids[index]
      )
    ) {
      return createFailureReport({
        encrypted,
        message:
          "Les workspaces de la SQLite ne correspondent pas au manifeste."
      });
    }

    const currentInstallation = await inspectCurrentInstallation(
      input.currentDatabasePath
    );
    const storageAnalysis = analyzeStoragePaths(verification.manifest);
    const activeStorage = await inspectActiveStorage({
      namespacesByWorkspace: storageAnalysis.namespacesByWorkspace,
      storageRoot: input.currentStorageRoot
    });
    const warnings = [...verification.warnings];
    const existingWorkspaceIds = verification.manifest.workspace_ids.filter(
      (workspaceId) =>
        currentInstallation.workspaceIds.includes(workspaceId)
    );
    const newWorkspaceIds = verification.manifest.workspace_ids.filter(
      (workspaceId) =>
        !currentInstallation.workspaceIds.includes(workspaceId)
    );

    if (!encrypted) {
      warnings.push(
        "Ce backup n’est pas chiffré et doit rester strictement privé."
      );
    }

    if (
      input.currentAppVersion &&
      verification.manifest.app_version !== input.currentAppVersion
    ) {
      warnings.push(
        `Version différente : backup ${verification.manifest.app_version}, installation ${input.currentAppVersion}.`
      );
    }

    if (existingWorkspaceIds.length > 0) {
      warnings.push(
        `Ce backup restaurerait un workspace déjà présent : ${existingWorkspaceIds.join(", ")}.`
      );
    }

    if (newWorkspaceIds.length > 0) {
      warnings.push(
        `Ce backup contient un workspace absent de l’installation actuelle : ${newWorkspaceIds.join(", ")}.`
      );
    }

    if (storageAnalysis.legacyPaths.length > 0) {
      warnings.push(
        `${storageAnalysis.legacyPaths.length} fichier(s) storage ont une structure legacy.`
      );
    }

    if (activeStorage.conflicts.length > 0) {
      warnings.push(
        "Le storage actif contient des dossiers qui entreraient en conflit avec ce backup."
      );
    }

    if (currentInstallation.inspectionWarning) {
      warnings.push(currentInstallation.inspectionWarning);
    }

    warnings.push(
      "SQLite et storage ne disposent pas d’un snapshot atomique commun garanti."
    );
    addAgeWarning(
      verification.manifest.created_at,
      warnings,
      input.now ?? new Date()
    );

    const uniqueWarnings = [...new Set(warnings)];
    const status =
      uniqueWarnings.length > 0 ? "restorable_with_warnings" : "restorable";

    return {
      appVersion: verification.manifest.app_version,
      backupDatabasePresent: true,
      backupDatabaseSizeBytes,
      backupId: verification.manifest.backup_id,
      checksumsValid: true,
      compatibility: "probable",
      createdAt: verification.manifest.created_at,
      currentInstallation: {
        databasePresent: currentInstallation.databasePresent,
        databaseSizeBytes: currentInstallation.databaseSizeBytes,
        storageConflicts: activeStorage.conflicts,
        storagePresent: activeStorage.storagePresent,
        workspaceIds: currentInstallation.workspaceIds
      },
      encrypted,
      errors: [],
      existingWorkspaceIds,
      fileCount: verification.fileCount,
      invalidFiles: [],
      legacyStorageFileCount: storageAnalysis.legacyPaths.length,
      newWorkspaceIds,
      passphraseRequired: false,
      recommendation:
        "Examinez tous les warnings. Une restauration réelle devra être confirmée dans une future commande.",
      requestedWorkspaceId:
        verification.manifest.requested_workspace_id,
      status,
      storagePresent: true,
      totalSizeBytes: verification.totalSizeBytes,
      warnings: uniqueWarnings,
      workspaceIds: verification.workspaceIds
    };
  } catch (error) {
    if (
      error instanceof BackupPassphraseRequiredError ||
      error instanceof InvalidBackupPassphraseError
    ) {
      throw error;
    }

    return createFailureReport({
      encrypted,
      message: error instanceof Error ? error.message : String(error)
    });
  } finally {
    decrypted?.fill(0);

    if (temporaryDirectory) {
      await cleanupTempDir(temporaryDirectory);
    }
  }
}
