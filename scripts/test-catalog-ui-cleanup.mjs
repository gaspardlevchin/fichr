import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  getCatalogHref,
  normalizeCatalogFilters
} from "../src/server/products/catalog-filters.ts";

const catalog = await readFile("src/app/catalog/page.tsx", "utf8");
const productList = await readFile(
  "src/components/catalog/catalog-bulk-export-form.tsx",
  "utf8"
);

const filters = normalizeCatalogFilters({
  import: "imp_123",
  status: "draft"
});

assert.equal(
  getCatalogHref(filters, { completeness: "incomplete" }).includes(
    "import=imp_123"
  ),
  true
);
assert.equal(catalog.includes("catalog-filter-groups"), true);
assert.equal(catalog.includes("selectedSpaceArchived"), false);
assert.equal(catalog.includes("summary.spaceNames"), false);
assert.equal(catalog.includes("Masquer les produits de cet import"), true);
assert.equal(catalog.includes("Restaurer les produits de cet import"), true);
assert.equal(productList.includes("Doublon potentiel"), true);
assert.equal(productList.includes("Fiche supprimée, export indisponible"), false);

console.log("Catalog UI cleanup coverage passed.");
