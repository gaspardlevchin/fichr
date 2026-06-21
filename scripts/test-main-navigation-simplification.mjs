import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { appNavigationItems } from "../src/lib/app-navigation.ts";

const header = await readFile("src/components/app-header.tsx", "utf8");
const home = await readFile("src/app/page.tsx", "utf8");

assert.deepEqual(
  appNavigationItems.map((item) => item.label),
  ["Imports", "Catalogue", "Exports"]
);
assert.equal(appNavigationItems.some((item) => item.label === "Espaces"), false);
assert.equal(header.includes("styles.planBadge"), false);
assert.equal(header.includes('href="/account"'), true);
assert.equal(header.includes('href="/settings"'), true);
assert.equal(header.includes('href="/spaces"'), true);
assert.equal(home.includes('title="Importer un catalogue"'), true);
assert.equal(home.includes('href="/imports"'), true);
assert.equal(home.includes('href="/catalog"'), true);

console.log("Main navigation simplification coverage passed.");
