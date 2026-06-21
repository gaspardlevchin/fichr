import { randomUUID } from "node:crypto";

import { findLegacyStorageCandidates } from "../src/server/storage/legacy-indexing.ts";
import { getConfiguredDataOwnershipMode } from "../src/server/storage/ownership.ts";
import { createLocalStorageProvider } from "../src/server/storage/providers/local.ts";
import {
  loadLocalEnvironment,
  openReadOnlyLocalDatabase,
  openWritableLocalDatabase,
  parseStorageArguments,
  readWorkspaceStorageObjects,
  resolveWorkspace
} from "./storage-script-utils.mjs";

function assertMode(args) {
  const dryRun = args["dry-run"] === true;
  const apply = args.apply === true;

  if (dryRun === apply) {
    throw new Error("Utilisez exactement une option : --dry-run ou --apply.");
  }

  if (!args.workspace && !args.email) {
    throw new Error("Précisez --workspace ou --email.");
  }

  return apply ? "apply" : "dry-run";
}

function printReport(report, mode) {
  console.log("Indexation contrôlée du stockage legacy");
  console.log(`Workspace : ${report.workspaceId}`);
  console.log(`Mode : ${mode}`);
  console.log(`Fichiers physiques : ${report.physicalFilesCount}`);
  console.log(`Déjà indexés : ${report.alreadyIndexedCount}`);
  console.log(`Indexables : ${report.candidates.length}`);
  console.log(`Refusés : ${report.unsafeFiles.length}`);

  for (const candidate of report.candidates) {
    console.log(
      `- ${candidate.objectType} | ${candidate.sizeBytes} octets | ${candidate.hashSha256.slice(0, 12)} | ${candidate.storageKey}`
    );
  }

  for (const warning of report.warnings) {
    console.warn(`Avertissement : ${warning}`);
  }
}

function insertLegacyStorageObjects(database, report) {
  const indexedAt = new Date().toISOString();
  const ownershipMode = getConfiguredDataOwnershipMode();
  const insert = database.prepare(
    `insert into storage_objects (
       id, workspace_id, provider_kind, ownership_mode, object_type,
       storage_key, filename, size_bytes, hash_sha256, metadata
     ) values (?, ?, 'local', ?, ?, ?, ?, ?, ?, ?)
     on conflict(workspace_id, provider_kind, storage_key) do nothing`
  );
  let insertedCount = 0;

  database.transaction(() => {
    for (const candidate of report.candidates) {
      const result = insert.run(
        `sto_${randomUUID().replaceAll("-", "")}`,
        report.workspaceId,
        ownershipMode,
        candidate.objectType,
        candidate.storageKey,
        candidate.filename,
        candidate.sizeBytes,
        candidate.hashSha256,
        JSON.stringify({
          indexedAt,
          legacy: true,
          source: "legacy_indexing"
        })
      );
      insertedCount += result.changes;
    }
  })();

  return insertedCount;
}

async function main() {
  loadLocalEnvironment();
  const args = parseStorageArguments(process.argv.slice(2));
  const mode = assertMode(args);
  const readDatabase = openReadOnlyLocalDatabase();
  let workspace;
  let trackedObjects;

  try {
    workspace = resolveWorkspace(readDatabase, args);
    trackedObjects = readWorkspaceStorageObjects(
      readDatabase,
      workspace.id
    );
  } finally {
    readDatabase.close();
  }

  const report = await findLegacyStorageCandidates({
    provider: createLocalStorageProvider(),
    trackedStorageKeys: trackedObjects.map((object) => object.storageKey),
    workspaceId: workspace.id
  });
  printReport(report, mode);

  if (mode === "dry-run") {
    console.log(
      `\nAucune modification effectuée. Pour appliquer : npm run storage:index-legacy -- --workspace ${workspace.id} --apply`
    );
    return;
  }

  const writeDatabase = openWritableLocalDatabase();

  try {
    const insertedCount = insertLegacyStorageObjects(writeDatabase, report);
    console.log(`\n${insertedCount} fichier(s) indexé(s).`);
    console.log("Aucun fichier physique ni donnée produit n’a été modifié.");
  } finally {
    writeDatabase.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

