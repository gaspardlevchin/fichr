import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { getImportFlowSteps } from "../src/lib/import-status.ts";

const component = await readFile(
  "src/components/import/import-flow-steps.tsx",
  "utf8"
);
const styles = await readFile("src/styles/globals.css", "utf8");
const steps = getImportFlowSteps("mapped", "ready");

assert.deepEqual(
  steps.map((step) => step.label),
  ["Fichier importé", "Mapping", "Préparation", "Création des brouillons"]
);
for (const className of [
  "import-flow-number",
  "import-flow-icon",
  "import-flow-copy",
  "import-flow-status"
]) {
  assert.equal(component.includes(className), true);
  assert.equal(styles.includes(`.${className}`), true);
}
assert.equal(component.includes("Étape {index + 1}"), false);
assert.equal(styles.includes("grid-template-columns: repeat(4, minmax(0, 1fr))"), true);

console.log("Import stepper layout coverage passed.");
