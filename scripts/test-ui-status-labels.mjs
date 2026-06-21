import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { getExportStatusLabel } from "../src/lib/export-status.ts";
import {
  getImportPreflightStatusLabel,
  getImportStatusLabel
} from "../src/lib/import-status.ts";
import {
  getDeletedProductStatusLabel,
  getProductAuditStateLabel,
  getProductStatusLabel
} from "../src/lib/product-status.ts";
import {
  getInvoiceStatusLabel,
  getPlanStatusLabel
} from "../src/lib/plan-status.ts";

assert.equal(getProductStatusLabel("draft"), "Brouillon");
assert.equal(getProductStatusLabel("needs_info"), "Incomplet");
assert.equal(getProductStatusLabel("needs_review"), "À vérifier");
assert.equal(getProductStatusLabel("validated"), "Validé");
assert.equal(getDeletedProductStatusLabel(), "Supprimé");
assert.equal(getProductAuditStateLabel("missing"), "Audit manquant");
assert.equal(getProductAuditStateLabel("stale"), "Audit obsolète");

assert.equal(getImportStatusLabel("uploaded"), "Fichier importé");
assert.equal(getImportStatusLabel("parsed"), "Mapping à valider");
assert.equal(getImportStatusLabel("mapped"), "Mapping validé");
assert.equal(getImportStatusLabel("processed"), "Brouillons créés");
assert.equal(getImportStatusLabel("failed"), "Erreur à corriger");
assert.equal(getImportPreflightStatusLabel("ready"), "Prêt à créer");
assert.equal(getImportPreflightStatusLabel("blocked"), "Bloqué");

assert.equal(getExportStatusLabel("complete"), "Généré");
assert.equal(getExportStatusLabel("deleted"), "Révoqué");
assert.equal(getExportStatusLabel("failed"), "Erreur");
assert.equal(getPlanStatusLabel("demo"), "Démo");
assert.equal(getPlanStatusLabel("active"), "Actif");
assert.equal(getPlanStatusLabel("expired"), "Expiré");
assert.equal(getPlanStatusLabel("suspended"), "Suspendu");
assert.equal(getPlanStatusLabel("pending_payment"), "Paiement en attente");
assert.equal(getInvoiceStatusLabel("paid"), "Payée");

const sources = await Promise.all(
  [
    "src/app/account/page.tsx",
    "src/app/exports/page.tsx",
    "src/app/imports/page.tsx",
    "src/app/imports/[importId]/page.tsx",
    "src/components/import/import-creation-preflight.tsx",
    "src/server/imports/errors.ts"
  ].map((file) => readFile(file, "utf8"))
);
const combinedSource = sources.join("\n");
assert.equal(combinedSource.includes("CSV import failed."), false);
assert.match(sources[0], /getPlanStatusLabel/);
assert.match(sources[0], /getInvoiceStatusLabel/);
assert.match(sources[1], /getExportStatusLabel/);

console.log("UI status label coverage passed.");
