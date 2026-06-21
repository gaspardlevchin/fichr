import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  applyCatalogFilters,
  getCatalogHref,
  getWorkspaceCatalogProducts,
  normalizeCatalogFilters
} from "../src/server/products/catalog-filters.ts";
import { buildProductImportBatchSummary } from "../src/server/products/import-origin.ts";

const workspaceId = "wks_import_filter";
const otherWorkspaceId = "wks_import_filter_other";

function createProduct(input) {
  const draftData = {
    title: input.title,
    description: input.description ?? "Description exploitable",
    category: input.category ?? "Décoration",
    materials: input.materials ?? "Céramique",
    dimensions: input.dimensions ?? "20 x 10 cm",
    desired_price: input.desiredPrice ?? 120
  };

  return {
    category: draftData.category,
    clientNotes: null,
    costPrice: null,
    createdAt: input.createdAt ?? "2026-06-19T10:00:00.000Z",
    currentPrice: null,
    deletedAt: input.deletedAt ?? null,
    description: draftData.description,
    desiredPrice: draftData.desired_price,
    dimensions: draftData.dimensions,
    draftData,
    id: input.id,
    imageUrl: null,
    importId: input.importId ?? null,
    materials: draftData.materials,
    origin: null,
    sku: input.sku ?? null,
    spaceArchivedAt: null,
    spaceId: input.spaceId ?? null,
    spaceName: input.spaceName ?? null,
    status: input.status,
    subtitle: null,
    targetMargin: null,
    title: input.title,
    validatedData: input.status === "validated" ? draftData : null,
    workspaceId: input.workspaceId
  };
}

const products = getWorkspaceCatalogProducts(
  [
    createProduct({
      id: "prd_a_vase",
      createdAt: "2026-06-19T10:00:00.000Z",
      importId: "imp_a",
      sku: "A-001",
      spaceId: "spc_showroom",
      spaceName: "Showroom",
      status: "draft",
      title: "Vase Alpha",
      workspaceId
    }),
    createProduct({
      id: "prd_a_lampe",
      createdAt: "2026-06-19T10:01:00.000Z",
      importId: "imp_a",
      sku: "A-002",
      status: "validated",
      title: "Lampe Alpha",
      workspaceId
    }),
    createProduct({
      id: "prd_a_deleted",
      deletedAt: "2026-06-19T11:00:00.000Z",
      importId: "imp_a",
      status: "needs_review",
      title: "Table supprimée",
      workspaceId
    }),
    createProduct({
      id: "prd_b",
      importId: "imp_b",
      status: "draft",
      title: "Produit import B",
      workspaceId
    }),
    createProduct({
      id: "prd_manual",
      status: "draft",
      title: "Produit manuel",
      workspaceId
    }),
    createProduct({
      id: "prd_other_workspace",
      importId: "imp_a",
      status: "validated",
      title: "SENTINEL_OTHER_WORKSPACE",
      workspaceId: otherWorkspaceId
    })
  ],
  workspaceId
);

const importA = normalizeCatalogFilters({ import: "imp_a" });
assert.deepEqual(
  applyCatalogFilters(products, importA).map((product) => product.id),
  ["prd_a_vase", "prd_a_lampe"]
);

assert.deepEqual(
  applyCatalogFilters(
    products,
    normalizeCatalogFilters({ import: "imp_a", q: "lampe" })
  ).map((product) => product.id),
  ["prd_a_lampe"]
);
assert.deepEqual(
  applyCatalogFilters(
    products,
    normalizeCatalogFilters({ import: "imp_a", status: "validated" })
  ).map((product) => product.id),
  ["prd_a_lampe"]
);
assert.deepEqual(
  applyCatalogFilters(
    products,
    normalizeCatalogFilters({
      import: "imp_a",
      space: "spc_showroom"
    })
  ).map((product) => product.id),
  ["prd_a_vase"]
);
assert.equal(
  applyCatalogFilters(products, importA).some(
    (product) => product.id === "prd_manual" || product.id === "prd_b"
  ),
  false
);
assert.equal(
  products.some((product) => product.title === "SENTINEL_OTHER_WORKSPACE"),
  false
);

const summary = buildProductImportBatchSummary(
  products.filter((product) => product.importId === "imp_a")
);
assert.equal(summary.productCount, 3);
assert.equal(summary.activeProductCount, 2);
assert.equal(summary.deletedProductCount, 1);
assert.equal(summary.draftCount, 1);
assert.equal(summary.validatedCount, 1);
assert.deepEqual(summary.spaceNames, ["Showroom"]);

assert.equal(
  getCatalogHref(
    normalizeCatalogFilters({
      import: "imp_a",
      q: "vase",
      status: "draft"
    }),
    { page: 2 }
  ),
  "/catalog?q=vase&status=draft&import=imp_a&page=2"
);
assert.equal(normalizeCatalogFilters({ import: "../../secret" }).importId, "");

const querySource = await readFile("src/server/products/queries.ts", "utf8");
const pageSource = await readFile("src/app/catalog/page.tsx", "utf8");
const combinedSource = `${querySource}\n${pageSource}`;

assert.match(querySource, /eq\(imports\.workspaceId, access\.workspaceId\)/);
assert.match(pageSource, /Lot importé/);
assert.match(pageSource, /Import introuvable/);
assert.match(pageSource, /Retirer le filtre/);
assert.equal(combinedSource.includes("storagePath"), false);
assert.equal(combinedSource.includes("AUTH_SESSION_SECRET"), false);
assert.equal(combinedSource.includes("/Users/"), false);

console.log("Catalog import filter coverage passed.");
