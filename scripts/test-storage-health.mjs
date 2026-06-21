import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { analyzeWorkspaceStorage } from "../src/server/storage/health.ts";
import { createWorkspaceStorageKey } from "../src/server/storage/path-safety.ts";
import { createLocalStorageProvider } from "../src/server/storage/providers/local.ts";

const tempDir = await mkdtemp(path.join(tmpdir(), "fichr-storage-health-"));
const provider = createLocalStorageProvider(tempDir);
const workspaceId = "wks_health_a";

async function writeTrackedFile(relativeKey, content) {
  const storageKey = createWorkspaceStorageKey({
    namespace: "exports",
    relativeKey,
    workspaceId
  });
  const metadata = await provider.writeFile({
    content: Buffer.from(content, "utf8"),
    storageKey,
    workspaceId
  });

  return { metadata, storageKey };
}

try {
  globalThis.fetch = () => {
    throw new Error("Network must not be called by storage health tests.");
  };

  const present = await writeTrackedFile("present.txt", "present");
  const hashMismatch = await writeTrackedFile("hash.txt", "hash-content");
  const sizeMismatch = await writeTrackedFile("size.txt", "size-content");
  const deletedPhysical = await writeTrackedFile(
    "deleted.txt",
    "deleted-content"
  );
  const orphanKey = createWorkspaceStorageKey({
    namespace: "imports",
    relativeKey: "legacy.csv",
    workspaceId
  });
  await provider.writeFile({
    content: Buffer.from("legacy", "utf8"),
    storageKey: orphanKey,
    workspaceId
  });
  const unsafeDirectory = path.join(tempDir, "exports", workspaceId);
  const unsafePath = path.join(unsafeDirectory, "unsafe name.txt");
  await mkdir(unsafeDirectory, { recursive: true });
  await writeFile(unsafePath, "unsafe", "utf8");

  const trackedObjects = [
    {
      deletedAt: null,
      hashSha256: present.metadata.hashSha256,
      id: "sto_present",
      metadata: null,
      sizeBytes: present.metadata.sizeBytes,
      storageKey: present.storageKey,
      workspaceId
    },
    {
      deletedAt: null,
      hashSha256: "0".repeat(64),
      id: "sto_hash",
      metadata: null,
      sizeBytes: hashMismatch.metadata.sizeBytes,
      storageKey: hashMismatch.storageKey,
      workspaceId
    },
    {
      deletedAt: null,
      hashSha256: sizeMismatch.metadata.hashSha256,
      id: "sto_size",
      metadata: null,
      sizeBytes: sizeMismatch.metadata.sizeBytes + 10,
      storageKey: sizeMismatch.storageKey,
      workspaceId
    },
    {
      deletedAt: null,
      hashSha256: "1".repeat(64),
      id: "sto_missing",
      metadata: null,
      sizeBytes: 12,
      storageKey: `exports/${workspaceId}/missing.txt`,
      workspaceId
    },
    {
      deletedAt: "2026-06-19T12:00:00.000Z",
      hashSha256: deletedPhysical.metadata.hashSha256,
      id: "sto_deleted",
      metadata: null,
      sizeBytes: deletedPhysical.metadata.sizeBytes,
      storageKey: deletedPhysical.storageKey,
      workspaceId
    }
  ];
  const report = await analyzeWorkspaceStorage({
    checkedAt: "2026-06-19T12:30:00.000Z",
    provider,
    trackedObjects,
    workspaceId
  });

  assert.equal(report.workspaceId, workspaceId);
  assert.equal(report.checkedAt, "2026-06-19T12:30:00.000Z");
  assert.equal(report.storageObjectsCount, 4);
  assert.equal(report.physicalFilesCount, 6);
  assert.equal(report.missingFilesCount, 1);
  assert.equal(report.hashMismatchCount, 1);
  assert.equal(report.sizeMismatchCount, 1);
  assert.equal(report.legacyFilesCount, 1);
  assert.equal(report.legacyIndexedCount, 0);
  assert.equal(report.orphanFilesCount, 2);
  assert.equal(report.unsafePathCount, 1);
  assert.equal(
    report.issues.some(
      (issue) =>
        issue.kind === "orphan_possible_legacy" &&
        issue.storageKey === orphanKey
    ),
    true
  );
  assert.equal(
    report.issues.some(
      (issue) =>
        issue.kind === "orphan_unexpected" &&
        issue.storageKey === deletedPhysical.storageKey
    ),
    true
  );
  assert.equal(
    await provider.exists({
      storageKey: orphanKey,
      workspaceId
    }),
    true,
    "diagnostic must not delete legacy files"
  );
  assert.equal(
    await provider.exists({
      storageKey: deletedPhysical.storageKey,
      workspaceId
    }),
    true,
    "diagnostic must not delete unexpected orphans"
  );

  await assert.rejects(
    () =>
      analyzeWorkspaceStorage({
        provider,
        trackedObjects: [
          {
            ...trackedObjects[0],
            workspaceId: "wks_health_b"
          }
        ],
        workspaceId
      }),
    /autre workspace/
  );
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

console.log("Storage health coverage passed.");
