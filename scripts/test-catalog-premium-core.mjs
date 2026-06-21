import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  getCatalogHref,
  normalizeCatalogFilters
} from "../src/server/products/catalog-filters.ts";

const page = await readFile("src/app/catalog/page.tsx", "utf8");
const query = await readFile("src/server/products/queries.ts", "utf8");
const products = await readFile(
  "src/components/catalog/catalog-bulk-export-form.tsx",
  "utf8"
);
const href = getCatalogHref(
  normalizeCatalogFilters({
    import: "imp_test",
    q: "vase",
    space: "spc_active"
  }),
  { status: "validated" }
);

for (const label of [
  "Résumé du catalogue",
  "Brouillons",
  "À compléter",
  "Prêtes",
  "Validées",
  "Doublons"
]) {
  assert.equal(page.includes(label), true);
}
assert.equal(href.includes("import=imp_test"), true);
assert.equal(href.includes("space=spc_active"), true);
assert.equal(href.includes("status=validated"), true);
assert.equal(query.includes("potentialDuplicateCount"), true);
assert.equal(query.includes("statusCounts"), true);
assert.equal(query.includes("isNull(spaces.deletedAt)"), true);
assert.equal(products.includes("product-card"), true);
assert.equal(products.includes("ProgressBar"), true);

console.log("Catalog premium core coverage passed.");
