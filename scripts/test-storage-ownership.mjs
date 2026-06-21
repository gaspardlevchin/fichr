import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  DEFAULT_DATA_OWNERSHIP_MODE,
  clientOwnedStorageObjectTypes,
  clientOwnedWorkingData,
  getConfiguredDataOwnershipMode,
  minimalFichrServerData
} from "../src/server/storage/ownership.ts";
import { getStorageProviderKind } from "../src/server/storage/providers/index.ts";

assert.equal(DEFAULT_DATA_OWNERSHIP_MODE, "local_device");
assert.equal(getConfiguredDataOwnershipMode({}), "local_device");
assert.equal(
  getConfiguredDataOwnershipMode({ DATA_OWNERSHIP_MODE: "self_hosted" }),
  "self_hosted"
);
assert.throws(
  () => getConfiguredDataOwnershipMode({ DATA_OWNERSHIP_MODE: "central_cloud" }),
  /inconnu/
);
assert.equal(getStorageProviderKind({}), "local");
assert.throws(
  () => getStorageProviderKind({ STORAGE_PROVIDER: "user_cloud_placeholder" }),
  /pas encore disponible/
);
assert.deepEqual(clientOwnedStorageObjectTypes, [
  "import_source",
  "product_image",
  "export_file",
  "generated_document",
  "future_attachment"
]);
assert.equal(clientOwnedWorkingData.includes("product_validated_data"), true);
assert.equal(minimalFichrServerData.includes("billing"), true);
assert.equal(minimalFichrServerData.includes("product_validated_data"), false);

const [
  accountSource,
  exportStorageSource,
  imageStorageSource,
  importStorageSource,
  localProviderSource,
  providerIndexSource,
  schemaSource,
  documentation
] = await Promise.all([
  readFile("src/app/account/page.tsx", "utf8"),
  readFile("src/server/exports/storage.ts", "utf8"),
  readFile("src/server/products/image-assets.ts", "utf8"),
  readFile("src/server/imports/storage.ts", "utf8"),
  readFile("src/server/storage/providers/local.ts", "utf8"),
  readFile("src/server/storage/providers/index.ts", "utf8"),
  readFile("db/schema.ts", "utf8"),
  readFile("docs/client-owned-storage.md", "utf8")
]);

assert.match(accountSource, /Stockage des données/);
assert.match(schemaSource, /storageObjects/);
assert.match(exportStorageSource, /getStorageProvider/);
assert.match(importStorageSource, /getStorageProvider/);
assert.match(imageStorageSource, /createLocalStorageProvider/);
assert.equal(exportStorageSource.includes("node:fs"), false);
assert.equal(importStorageSource.includes("node:fs"), false);
assert.equal(imageStorageSource.includes("node:fs"), false);
assert.equal(localProviderSource.includes("fetch("), false);
assert.equal(providerIndexSource.includes("fetch("), false);
assert.equal(
  /drive\.google|dropboxapi|graph\.microsoft|icloud|s3\.amazonaws/i.test(
    `${localProviderSource}\n${providerIndexSource}`
  ),
  false
);
assert.match(documentation, /client-owned/i);
assert.match(documentation, /raw_data/);
assert.match(documentation, /multi-device/);

console.log("Storage ownership coverage passed.");
