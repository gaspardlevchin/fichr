import path from "node:path";

import { verifyBackupFile } from "./backup-verification-core.mjs";
import { parseStorageArguments } from "./storage-script-utils.mjs";

async function main() {
  const args = parseStorageArguments(process.argv.slice(2));

  if (
    typeof args.file !== "string" ||
    (!args.file.endsWith(".zip") && !args.file.endsWith(".fichrbackup"))
  ) {
    throw new Error(
      "Usage : npm run backup:verify -- --file artifacts/fichr-backup-....zip|.fichrbackup"
    );
  }

  const archivePath = path.resolve(args.file);
  const report = await verifyBackupFile({
    archivePath,
    passphrase: process.env.BACKUP_PASSPHRASE
  });

  if (report.passphraseRequired) {
    console.log("Backup chiffré, passphrase requise.");
    console.log(
      "Relancez avec BACKUP_PASSPHRASE défini temporairement."
    );
    console.log("Aucune restauration ni modification locale n’a été effectuée.");
    return;
  }

  console.log("Backup Fichr vérifié.");
  console.log(`Chiffrement : ${report.encrypted ? "AES-256-GCM" : "non"}`);
  console.log(`Backup ID : ${report.backupId}`);
  console.log(`Workspaces : ${report.workspaceIds.join(", ")}`);
  console.log(`Fichiers vérifiés : ${report.fileCount}`);
  console.log(`Taille vérifiée : ${report.totalSizeBytes} octets`);

  for (const warning of report.warnings) {
    console.warn(`Avertissement : ${warning}`);
  }

  console.log("Aucune restauration ni modification locale n’a été effectuée.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
