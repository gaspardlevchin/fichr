import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { appNavigationItems } from "../src/lib/app-navigation.ts";

assert.deepEqual(
  appNavigationItems.map((item) => item.label),
  ["Imports", "Catalogue", "Exports"]
);
assert.deepEqual(
  appNavigationItems.map((item) => item.href),
  ["/imports", "/catalog", "/exports"]
);

const files = {
  account: await readFile("src/app/account/page.tsx", "utf8"),
  billing: await readFile("src/app/billing/plans/page.tsx", "utf8"),
  catalog: await readFile("src/app/catalog/page.tsx", "utf8"),
  exports: await readFile("src/app/exports/page.tsx", "utf8"),
  header: await readFile("src/components/app-header.tsx", "utf8"),
  home: await readFile("src/app/page.tsx", "utf8"),
  importDropzone: await readFile(
    "src/components/import/import-dropzone.tsx",
    "utf8"
  ),
  importDetail: await readFile("src/app/imports/[importId]/page.tsx", "utf8"),
  imports: await readFile("src/app/imports/page.tsx", "utf8"),
  product: await readFile("src/app/products/[productId]/page.tsx", "utf8"),
  settings: await readFile("src/app/settings/page.tsx", "utf8"),
  spaces: await readFile("src/app/spaces/page.tsx", "utf8")
};

for (const [name, source] of Object.entries(files)) {
  if (name === "header" || name === "importDropzone") {
    continue;
  }

  assert.equal(source.includes("<PageHeader"), true, `${name} needs PageHeader`);
}

assert.match(files.catalog, /title="Catalogue"/);
assert.match(files.imports, /title="Imports CSV"/);
assert.match(files.exports, /title="Exports"/);
assert.match(files.spaces, /title="Espaces"/);
assert.match(files.account, /title="Compte"/);
assert.match(files.billing, /title="Plans"/);
assert.match(files.settings, /title="Réglages"/);
assert.match(files.home, /title="Importer un catalogue"/);

assert.match(files.catalog, /Importer un CSV/);
assert.match(files.importDropzone, /Importer le CSV/);
assert.match(files.exports, /Exporter tout en PDF/);
assert.match(files.spaces, /Créer l’espace/);
assert.match(files.account, /Voir les plans/);
assert.match(files.product, /Corriger la fiche/);

assert.match(files.header, /href="\/account"/);
assert.match(files.header, /Réglages/);
assert.match(files.header, /href="\/spaces"/);
assert.equal(files.header.includes("backup:local"), false);
assert.equal(files.header.includes("storage:doctor"), false);
assert.equal(files.header.includes("Facturation"), false);
assert.equal(
  appNavigationItems.some((item) => item.label === "Pilotage"),
  false
);
assert.equal(
  appNavigationItems.some((item) => item.label === "Paramètres"),
  false
);
assert.equal(
  appNavigationItems.some((item) => item.label === "Espaces"),
  false
);

console.log("UI navigation coverage passed.");
