import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  deleteOriginalCsvFile,
  saveOriginalCsvFile
} from "../src/server/imports/storage.ts";
import { createWorkspaceStorageKey } from "../src/server/storage/path-safety.ts";
import { createLocalStorageProvider } from "../src/server/storage/providers/local.ts";

const tempDir = await mkdtemp(path.join(tmpdir(), "fichr-storage-provider-"));
const previousStorageRoot = process.env.LOCAL_STORAGE_ROOT;
process.env.LOCAL_STORAGE_ROOT = tempDir;

try {
  const provider = createLocalStorageProvider(tempDir);
  const workspaceId = "wks_storage_a";
  const storageKey = createWorkspaceStorageKey({
    namespace: "exports",
    relativeKey: "controlled-file.txt",
    workspaceId
  });
  const content = Buffer.from("client-owned storage", "utf8");
  const written = await provider.writeFile({
    content,
    mimeType: "text/plain",
    storageKey,
    workspaceId
  });

  assert.equal(provider.kind, "local");
  assert.equal(written.storageKey, storageKey);
  assert.equal(written.sizeBytes, content.byteLength);
  assert.equal(written.hashSha256.length, 64);
  assert.equal(await provider.exists({ storageKey, workspaceId }), true);
  assert.equal(
    (await provider.readFile({ storageKey, workspaceId })).equals(content),
    true
  );
  assert.equal(
    (await provider.getMetadata({ storageKey, workspaceId })).hashSha256,
    written.hashSha256
  );

  await assert.rejects(
    () =>
      provider.readFile({
        storageKey,
        workspaceId: "wks_storage_b"
      }),
    /hors du workspace/
  );
  await assert.rejects(
    () =>
      provider.writeFile({
        content,
        storageKey: "exports/wks_storage_a/../escape.txt",
        workspaceId
      }),
    /invalide/
  );

  assert.equal(await provider.deleteFile({ storageKey, workspaceId }), true);
  assert.equal(await provider.exists({ storageKey, workspaceId }), false);
  assert.equal(await provider.deleteFile({ storageKey, workspaceId }), false);

  const storedImport = await saveOriginalCsvFile({
    content: Buffer.from("title\nProduit local", "utf8"),
    filename: "../../catalogue client.csv",
    importId: "imp_storage_test",
    workspaceId
  });
  assert.equal(
    storedImport.storageKey,
    "imports/wks_storage_a/imp_storage_test-catalogue_client.csv"
  );
  assert.equal(
    (
      await provider.readFile({
        storageKey: storedImport.storageKey,
        workspaceId
      })
    ).includes("Produit local"),
    true
  );
  assert.equal(
    await deleteOriginalCsvFile({
      storageKey: storedImport.storageKey,
      workspaceId
    }),
    true
  );
} finally {
  if (previousStorageRoot === undefined) {
    delete process.env.LOCAL_STORAGE_ROOT;
  } else {
    process.env.LOCAL_STORAGE_ROOT = previousStorageRoot;
  }
  await rm(tempDir, { force: true, recursive: true });
}

console.log("Storage provider coverage passed.");
