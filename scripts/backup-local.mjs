import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  loadLocalEnvironment,
  openReadOnlyLocalDatabase,
  parseStorageArguments,
  resolveLocalDatabasePath,
  resolveWorkspace
} from "./storage-script-utils.mjs";
import { createEncryptedLocalBackup } from "./encrypted-local-backup-core.mjs";
import { createLocalBackup } from "./local-backup-core.mjs";

async function main() {
  loadLocalEnvironment();
  const args = parseStorageArguments(process.argv.slice(2));
  const database = openReadOnlyLocalDatabase();
  let workspace;

  try {
    workspace = resolveWorkspace(database, args);
  } finally {
    database.close();
  }

  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const backupInput = {
    appVersion: packageJson.version,
    artifactsDirectory: path.resolve("artifacts"),
    databasePath: resolveLocalDatabasePath(),
    storageRoot: path.resolve(
      process.env.LOCAL_STORAGE_ROOT ?? "storage"
    ),
    workspaceId: workspace.id
  };
  const encrypt = args.encrypt === true;

  if (args.encrypt !== undefined && !encrypt) {
    throw new Error("L’option --encrypt ne prend pas de valeur.");
  }

  const result = encrypt
    ? await createEncryptedLocalBackup({
        ...backupInput,
        passphrase: process.env.BACKUP_PASSPHRASE
      })
    : await createLocalBackup(backupInput);

  console.warn(result.warning);
  console.log(`Workspace de référence : ${workspace.name} (${workspace.id})`);
  console.log(`Sauvegarde privée créée : ${result.outputPath}`);
  console.log(`Fichiers vérifiés : ${result.manifest.file_count}`);
  console.log(`Taille totale : ${result.manifest.total_size_bytes} octets`);
  console.log(`Chiffrement : ${encrypt ? "AES-256-GCM" : "désactivé"}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
