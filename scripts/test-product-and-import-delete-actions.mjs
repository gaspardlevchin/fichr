import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const product = await readFile("src/app/products/[productId]/page.tsx", "utf8");
const catalog = await readFile("src/app/catalog/page.tsx", "utf8");
const exportsPage = await readFile("src/app/exports/page.tsx", "utf8");
const exportCore = await readFile("src/server/exports/core.ts", "utf8");
const deletion = await readFile("src/server/products/deletion.ts", "utf8");

assert.equal(product.includes("deleteProductAction"), true);
assert.equal(product.includes("restoreProductAction"), true);
assert.equal(deletion.includes(".delete(products)"), false);
assert.equal(catalog.includes("Masquer les produits de cet import"), true);
assert.equal(catalog.includes("Restaurer les produits de cet import"), true);
assert.equal(catalog.includes("Supprimer l’import"), false);
assert.equal(exportsPage.includes(">Indisponible<"), false);
assert.match(exportCore, /!product\.deletedAt/);

console.log("Product and import delete action coverage passed.");
