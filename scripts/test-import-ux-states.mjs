import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  getImportFlowSteps,
  getImportPreflightStatusLabel,
  getImportStatusLabel
} from "../src/lib/import-status.ts";
import {
  ImportQuotaExceededError,
  getImportActionErrorMessage
} from "../src/server/imports/errors.ts";

const parsedSteps = getImportFlowSteps("parsed", "mapping_required");
assert.equal(parsedSteps[1].detail, "Mapping à valider");
assert.equal(parsedSteps[1].state, "current");
assert.equal(parsedSteps[2].state, "pending");

const mappedSteps = getImportFlowSteps("mapped", "ready");
assert.equal(mappedSteps[1].detail, "Mapping validé");
assert.equal(mappedSteps[2].detail, "Création prête");
assert.equal(mappedSteps[3].detail, "Prêt");

const blockedSteps = getImportFlowSteps("mapped", "blocked");
assert.equal(blockedSteps[2].state, "blocked");
assert.equal(blockedSteps[3].detail, "À corriger");
assert.equal(getImportPreflightStatusLabel("blocked"), "Bloqué");

const processedSteps = getImportFlowSteps(
  "processed",
  "already_processed"
);
assert.equal(processedSteps[3].detail, "Brouillons créés");
assert.equal(processedSteps.every((step) => step.state === "complete"), true);
assert.equal(getImportStatusLabel("processed"), "Brouillons créés");

const quotaMessage = getImportActionErrorMessage(
  new ImportQuotaExceededError(
    "Votre plan Démo autorise 10 produits. Ce fichier contient 30 lignes."
  )
);
assert.match(quotaMessage, /plan Démo autorise 10 produits/);
assert.equal(quotaMessage.includes("CSV import failed."), false);

const detailPageSource = await readFile(
  "src/app/imports/[importId]/page.tsx",
  "utf8"
);
const listPageSource = await readFile("src/app/imports/page.tsx", "utf8");
const preflightComponentSource = await readFile(
  "src/components/import/import-creation-preflight.tsx",
  "utf8"
);
const stepsComponentSource = await readFile(
  "src/components/import/import-flow-steps.tsx",
  "utf8"
);
const validationSummarySource = await readFile(
  "src/components/import/import-validation-summary.tsx",
  "utf8"
);
const errorSource = await readFile("src/server/imports/errors.ts", "utf8");
const combinedSource = [
  detailPageSource,
  listPageSource,
  preflightComponentSource,
  stepsComponentSource,
  validationSummarySource,
  errorSource
].join("\n");

assert.match(detailPageSource, /ImportFlowSteps/);
assert.match(detailPageSource, /ImportCreationPreflightPanel/);
assert.match(detailPageSource, /obligatoire/);
assert.match(detailPageSource, /Colonnes reconnues/);
assert.match(detailPageSource, /Colonnes non utilisées/);
assert.match(preflightComponentSource, /disabled=\{!preflight\.canCreate\}/);
assert.match(preflightComponentSource, /produits brouillons créés/);
assert.match(preflightComponentSource, /\/catalog\?import=/);
assert.match(preflightComponentSource, /Voir les produits créés/);
assert.match(preflightComponentSource, /Brouillons déjà créés/);
assert.match(validationSummarySource, /Points principaux à vérifier/);
assert.match(validationSummarySource, /Voir les lignes concernées/);
assert.match(listPageSource, /getImportStatusLabel\(importItem\.status\)/);
assert.match(listPageSource, /importItem\.rowCount.*lignes/s);
assert.match(listPageSource, /"Voir" : "Continuer"/);
assert.match(listPageSource, /dateTime=\{importItem\.createdAt\}/);
assert.equal(combinedSource.includes("CSV import failed."), false);
assert.equal(combinedSource.includes("AUTH_SESSION_SECRET"), false);
assert.equal(/\/Users\/|[A-Z]:\\/.test(combinedSource), false);
assert.equal(combinedSource.includes("fetch("), false);
assert.equal(combinedSource.includes("OpenAI"), false);

console.log("Import UX state coverage passed.");
