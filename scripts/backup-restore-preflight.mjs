import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  loadLocalEnvironment,
  parseStorageArguments,
  resolveLocalDatabasePath
} from "./storage-script-utils.mjs";
import { runBackupRestorePreflight } from "./backup-restore-preflight-core.mjs";

function formatBytes(value) {
  return typeof value === "number" ? `${value} octets` : "indisponible";
}

function printReport(report) {
  console.log("Rapport de pré-restauration Fichr");
  console.log(`Statut : ${report.status}`);
  console.log(`Backup ID : ${report.backupId ?? "indisponible"}`);
  console.log(`Créé le : ${report.createdAt ?? "indisponible"}`);
  console.log(`Chiffré : ${report.encrypted ? "oui" : "non"}`);
  console.log(`Version app : ${report.appVersion ?? "indisponible"}`);
  console.log(
    `Workspaces : ${report.workspaceIds?.join(", ") || "indisponible"}`
  );
  console.log(
    `Workspace demandé : ${report.requestedWorkspaceId ?? "indisponible"}`
  );
  console.log(
    `SQLite du backup : ${report.backupDatabasePresent ? "présente" : "absente"}`
  );
  console.log(
    `Taille SQLite du backup : ${formatBytes(report.backupDatabaseSizeBytes)}`
  );
  console.log(`Storage du backup : ${report.storagePresent ? "présent" : "absent"}`);
  console.log(`Fichiers : ${report.fileCount ?? 0}`);
  console.log(`Taille totale : ${formatBytes(report.totalSizeBytes)}`);
  console.log(`Checksums : ${report.checksumsValid ? "valides" : "invalides"}`);
  console.log(`Compatibilité : ${report.compatibility ?? "inconnue"}`);

  if (report.currentInstallation) {
    console.log(
      `SQLite actuelle : ${formatBytes(report.currentInstallation.databaseSizeBytes)}`
    );
    console.log(
      `Workspaces actuels : ${
        report.currentInstallation.workspaceIds.join(", ") || "aucun"
      }`
    );
  }

  for (const warning of report.warnings ?? []) {
    console.warn(`Avertissement : ${warning}`);
  }

  for (const error of report.errors ?? []) {
    console.error(`Erreur bloquante : ${error}`);
  }

  if (report.invalidFiles?.length > 0) {
    console.error(`Fichiers invalides : ${report.invalidFiles.join(", ")}`);
  }

  console.log(`Recommandation : ${report.recommendation}`);
  console.log(
    "Aucune restauration, suppression ou modification de l’installation active n’a été effectuée."
  );
}

async function main() {
  const passphrase = process.env.BACKUP_PASSPHRASE;
  loadLocalEnvironment();
  const args = parseStorageArguments(process.argv.slice(2));

  if (
    typeof args.file !== "string" ||
    (!args.file.endsWith(".zip") && !args.file.endsWith(".fichrbackup"))
  ) {
    throw new Error(
      "Usage : npm run backup:restore-preflight -- --file artifacts/fichr-backup-....zip|.fichrbackup"
    );
  }

  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const report = await runBackupRestorePreflight({
    archivePath: path.resolve(args.file),
    currentAppVersion: packageJson.version,
    currentDatabasePath: resolveLocalDatabasePath(),
    currentStorageRoot: path.resolve(
      process.env.LOCAL_STORAGE_ROOT ?? "storage"
    ),
    passphrase
  });

  printReport(report);

  if (report.status === "not_restorable" && !report.passphraseRequired) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
