import { analyzeWorkspaceStorage } from "../src/server/storage/health.ts";
import { createLocalStorageProvider } from "../src/server/storage/providers/local.ts";
import {
  loadLocalEnvironment,
  openReadOnlyLocalDatabase,
  parseStorageArguments,
  readWorkspaceStorageObjects,
  resolveWorkspace
} from "./storage-script-utils.mjs";

function printList(title, values) {
  console.log(`\n${title}`);

  if (values.length === 0) {
    console.log("- Aucun");
    return;
  }

  for (const value of values) {
    console.log(`- ${value}`);
  }
}

async function main() {
  loadLocalEnvironment();
  const args = parseStorageArguments(process.argv.slice(2));
  const database = openReadOnlyLocalDatabase();

  try {
    const workspace = resolveWorkspace(database, args);
    const trackedObjects = readWorkspaceStorageObjects(database, workspace.id);
    const report = await analyzeWorkspaceStorage({
      provider: createLocalStorageProvider(),
      trackedObjects,
      workspaceId: workspace.id
    });

    console.log("Diagnostic stockage Fichr");
    console.log(`Workspace : ${workspace.name} (${workspace.id})`);
    console.log(`Vérifié le : ${report.checkedAt}`);
    console.log(`Objets suivis : ${report.storageObjectsCount}`);
    console.log(`Fichiers physiques : ${report.physicalFilesCount}`);
    console.log(`Fichiers manquants : ${report.missingFilesCount}`);
    console.log(`Fichiers orphelins : ${report.orphanFilesCount}`);
    console.log(`Fichiers hérités possibles : ${report.legacyFilesCount}`);
    console.log(`Fichiers legacy déjà indexés : ${report.legacyIndexedCount}`);
    console.log(`Hash divergents : ${report.hashMismatchCount}`);
    console.log(`Tailles divergentes : ${report.sizeMismatchCount}`);
    console.log(`Chemins non sûrs : ${report.unsafePathCount}`);

    printList("Erreurs", report.errors);
    printList("Avertissements", report.warnings);
    printList(
      "Fichiers concernés",
      report.issues.map(
        (issue) => `${issue.kind} : ${issue.storageKey}`
      )
    );
    printList("Recommandations", report.recommendations);

    console.log("\nAucun fichier ni enregistrement DB n’a été modifié.");
  } finally {
    database.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
