import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { formatCount } from "../src/lib/format-count.ts";

const home = await readFile("src/app/page.tsx", "utf8");
const shell = await readFile("src/components/app-shell.tsx", "utf8");
const product = await readFile("src/app/products/[productId]/page.tsx", "utf8");
const auditCard = await readFile(
  "src/components/product/audit-finding-card.tsx",
  "utf8"
);
const login = await readFile("src/app/login/page.tsx", "utf8");
const importsPage = await readFile("src/app/imports/page.tsx", "utf8");
const importDetail = await readFile(
  "src/app/imports/[importId]/page.tsx",
  "utf8"
);
const styles = await readFile("src/styles/globals.css", "utf8");
const visibleUi = (
  await Promise.all(
    [
      "src/app/page.tsx",
      "src/app/catalog/page.tsx",
      "src/app/exports/page.tsx",
      "src/app/imports/page.tsx",
      "src/app/imports/[importId]/page.tsx",
      "src/app/products/[productId]/page.tsx",
      "src/app/spaces/page.tsx",
      "src/components/catalog/catalog-bulk-export-form.tsx",
      "src/components/import/import-created-products.tsx",
      "src/components/import/import-validation-summary.tsx"
    ].map((path) => readFile(path, "utf8"))
  )
).join("\n");

assert.equal(formatCount(1, "fiche", "fiches"), "1 fiche");
assert.equal(formatCount(2, "fiche", "fiches"), "2 fiches");
assert.equal(home.includes("getCatalogProductsResult"), true);
assert.equal(home.includes("catalog.totalCount"), true);
assert.equal(shell.includes("getCatalogProducts"), false);
assert.equal(shell.includes("catalogProducts"), false);
assert.equal(auditCard.includes("Champ manquant"), true);
assert.equal(auditCard.includes("Décision client recommandée"), true);
assert.equal(auditCard.includes("{finding.type}"), false);
assert.equal(auditCard.includes("{finding.fieldKey}"), false);
assert.equal(product.includes("OPENAI_MODEL"), false);
assert.equal(product.includes("aiStatus.reason"), false);
assert.equal(product.includes("Clé API"), false);
assert.equal(login.includes('className="login-brand"'), true);
assert.equal(importsPage.includes("sourceType.toUpperCase()"), true);
assert.equal(importDetail.includes("sourceType.toUpperCase()"), true);
assert.equal(visibleUi.includes("(s)"), false);
assert.equal(styles.includes(".finding-meta"), true);
assert.equal(styles.includes("min-width: 3px"), false);
assert.equal(styles.includes(".inline-alert.success-text"), true);
assert.equal(
  styles.includes("font-size: clamp(1.2rem, 1.5vw, 1.45rem)"),
  true
);

console.log("UI micro-polish coverage passed.");
