import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  getProductCompletenessIndicatorLabel,
  getProductCompletenessStatusLabel,
  getProductStatusLabel
} from "../src/lib/product-completeness.ts";
import { appNavigationItems } from "../src/lib/app-navigation.ts";

assert.equal(getProductStatusLabel("draft"), "Brouillon");
assert.equal(getProductStatusLabel("needs_info"), "Incomplet");
assert.equal(getProductStatusLabel("needs_review"), "À vérifier");
assert.equal(getProductStatusLabel("validated"), "Validé");
assert.equal(
  getProductCompletenessStatusLabel("ready_to_validate"),
  "Prête à valider"
);
assert.equal(
  getProductCompletenessIndicatorLabel("ready"),
  "Prêt à valider"
);

const productPage = await readFile(
  "src/app/products/[productId]/page.tsx",
  "utf8"
);
const catalogPage = await readFile("src/app/catalog/page.tsx", "utf8");
const catalogForm = await readFile(
  "src/components/catalog/catalog-bulk-export-form.tsx",
  "utf8"
);
const imageUpload = await readFile(
  "src/components/product/product-image-upload.tsx",
  "utf8"
);
const importDropzone = await readFile(
  "src/components/import/import-dropzone.tsx",
  "utf8"
);
const exportsPage = await readFile("src/app/exports/page.tsx", "utf8");
const homePage = await readFile("src/app/page.tsx", "utf8");
const progressBar = await readFile(
  "src/components/ui/progress-bar.tsx",
  "utf8"
);
const uiIcon = await readFile("src/components/ui/ui-icon.tsx", "utf8");

for (const label of [
  "Édition",
  "Données conservées",
  "Contrôle déterministe",
  "Aucune image",
  "Retour au catalogue"
]) {
  assert.equal(productPage.includes(label), true, `${label} should be visible`);
}

for (const label of ["À compléter", "À revoir", "Prêtes", "Complètes"]) {
  assert.equal(catalogPage.includes(label), true, `${label} should be visible`);
}

assert.equal(
  appNavigationItems.some((item) => item.label === "Imports"),
  true
);
assert.equal(
  appNavigationItems.some((item) => item.label === "Exports"),
  true
);
assert.equal(homePage.includes('title="Importer un catalogue"'), true);
assert.equal(homePage.includes(">Tableau de bord<"), false);
assert.equal(imageUpload.includes("replaceProductImageAction"), true);
assert.equal(productPage.includes("removeProductImageAction"), true);
assert.equal(productPage.includes("deleteProductAction"), true);
assert.equal(productPage.includes("ProductImageUpload"), true);
assert.equal(imageUpload.includes("Remplacer l’image"), true);
assert.equal(imageUpload.includes("Aucun fichier sélectionné"), true);
assert.equal(importDropzone.includes("Aucun fichier sélectionné"), true);
assert.equal(importDropzone.includes('name="upload"'), true);
assert.equal(exportsPage.includes("Produits prêts à exporter"), true);
assert.equal(exportsPage.includes("data.validatedProductCount === 0"), true);
assert.equal(exportsPage.includes("getExportStatusLabel"), true);
assert.equal(productPage.includes("Retirer l’image"), true);
assert.equal(productPage.includes("Supprimer la fiche"), true);
assert.equal(catalogForm.includes("product-thumb"), true);
assert.equal(catalogForm.includes("backgroundImage"), true);
assert.equal(catalogForm.includes("Aucune image"), true);
assert.equal(catalogForm.includes("<ProgressBar"), true);
assert.equal(homePage.includes("Avancement du catalogue"), true);
assert.equal(progressBar.includes('role="progressbar"'), true);
assert.equal(uiIcon.includes('name: UiIconName'), true);
assert.equal(productPage.includes(">Edition<"), false);
assert.equal(productPage.includes(">Controle deterministe<"), false);
assert.equal(catalogPage.includes('"A completer"'), false);

console.log("UI copy label coverage passed.");
