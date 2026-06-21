import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const emptyState = await readFile("src/components/ui/empty-state.tsx", "utf8");
const catalog = await readFile("src/app/catalog/page.tsx", "utf8");
const imports = await readFile("src/app/imports/page.tsx", "utf8");
const exportsPage = await readFile("src/app/exports/page.tsx", "utf8");
const spaces = await readFile("src/app/spaces/page.tsx", "utf8");

assert.match(emptyState, /empty-state-actions/);
assert.match(catalog, /title="Catalogue vide"/);
assert.match(catalog, /Importer un CSV/);
assert.match(catalog, /title="Aucune fiche dans ce lot"/);
assert.match(catalog, /Retirer le filtre/);
assert.match(catalog, /title="Aucune fiche masquée"/);
assert.match(imports, /title="Aucun import"/);
assert.match(imports, /Choisir un CSV/);
assert.match(exportsPage, /title="Aucun export généré"/);
assert.match(exportsPage, /title="Aucun produit prêt à exporter"/);
assert.match(spaces, /title=\{/);
assert.match(spaces, /Créer un espace/);
assert.match(spaces, /Voir les espaces actifs/);

console.log("UI empty state coverage passed.");
