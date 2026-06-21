import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  assertSafeStorageKey,
  assertWorkspaceStorageScope,
  createWorkspaceStorageKey,
  resolveWorkspaceStoragePath,
  sanitizeFilename
} from "../src/server/storage/path-safety.ts";

assert.equal(
  createWorkspaceStorageKey({
    namespace: "imports",
    relativeKey: "imp_safe-source.csv",
    workspaceId: "wks_safe"
  }),
  "imports/wks_safe/imp_safe-source.csv"
);
assert.equal(
  assertSafeStorageKey("images/wks_safe/prd_safe/image.jpg"),
  "images/wks_safe/prd_safe/image.jpg"
);
assert.equal(
  assertWorkspaceStorageScope("exports/wks_safe/file.pdf", "wks_safe"),
  "exports/wks_safe/file.pdf"
);
assert.throws(
  () => assertSafeStorageKey("../outside/file.txt"),
  /invalide/
);
assert.throws(
  () => assertSafeStorageKey("exports/wks_safe/../outside.pdf"),
  /invalide/
);
assert.throws(
  () => assertSafeStorageKey("/tmp/absolute.pdf"),
  /invalide/
);
assert.throws(
  () => assertSafeStorageKey("C:\\temp\\absolute.pdf"),
  /invalide/
);
assert.throws(
  () =>
    assertWorkspaceStorageScope(
      "exports/wks_other/private.pdf",
      "wks_safe"
    ),
  /hors du workspace/
);
assert.equal(
  sanitizeFilename("../../devis client?.csv"),
  "devis_client_.csv"
);

const storageRoot = path.join(tmpdir(), "fichr-storage-path-root");
const targetPath = resolveWorkspaceStoragePath({
  storageKey: "exports/wks_safe/file.pdf",
  storageRoot,
  workspaceId: "wks_safe"
});
assert.equal(
  targetPath,
  path.join(storageRoot, "exports", "wks_safe", "file.pdf")
);

console.log("Storage path safety coverage passed.");

