import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "src/components/app-header.tsx",
  "src/components/import/import-flow-steps.tsx",
  "src/app/imports/page.tsx",
  "src/app/imports/[importId]/page.tsx",
  "src/app/exports/page.tsx"
];
const source = (
  await Promise.all(paths.map((path) => readFile(path, "utf8")))
).join("\n");

for (const regression of [
  "CompteRéglages",
  "StudioActif",
  "Étape 1Fichier",
  "ignoree",
  "creera",
  "Cette ligne est prete"
]) {
  assert.equal(source.includes(regression), false, `${regression} must stay fixed`);
}

assert.equal(/\.csv\d{1,2}\s/.test(source), false);
assert.equal(source.includes("<time dateTime={importItem.createdAt}>"), true);
assert.equal(source.includes("export-history-meta"), true);

console.log("Visual regression copy fixes coverage passed.");
