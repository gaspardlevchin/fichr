import assert from "node:assert/strict";

import {
  applyCatalogFilters,
  getWorkspaceCatalogProducts,
  normalizeCatalogFilters
} from "../src/server/products/catalog-filters.ts";

const workspaceId = "wks_catalog_filters";
const otherWorkspaceId = "wks_catalog_filters_other";
const outsideSentinel = "OUTSIDE_WORKSPACE_PRODUCT";

function createProduct(input) {
  return {
    category: input.category ?? null,
    createdAt: input.createdAt,
    currentPrice: input.currentPrice ?? null,
    deletedAt: input.deletedAt ?? null,
    description: input.description ?? null,
    desiredPrice: input.desiredPrice ?? null,
    id: input.id,
    imageUrl: null,
    importId: input.importId ?? null,
    sku: input.sku ?? null,
    status: input.status,
    spaceId: input.spaceId ?? null,
    spaceName: input.spaceName ?? null,
    subtitle: input.subtitle ?? null,
    title: input.title,
    workspaceId: input.workspaceId
  };
}

const sourceProducts = [
  createProduct({
    id: "prd_vase",
    workspaceId,
    status: "validated",
    title: "Vase Alpha",
    subtitle: "Serie showroom",
    category: "Decoration",
    sku: "VA-001",
    description: "Piece emaillee",
    createdAt: "2026-06-01T10:00:00.000Z",
    spaceId: "spc_showroom",
    spaceName: "Showroom"
  }),
  createProduct({
    id: "prd_lampe",
    workspaceId,
    status: "draft",
    title: "Lampe Beta",
    category: "Luminaire",
    sku: "LB-002",
    description: "Brouillon pour audit",
    createdAt: "2026-06-03T10:00:00.000Z"
  }),
  createProduct({
    id: "prd_table",
    workspaceId,
    status: "needs_review",
    title: "Table Gamma",
    subtitle: "A controler",
    category: "Mobilier",
    sku: "TG-003",
    description: "Fiche modifiee apres validation",
    createdAt: "2026-06-02T10:00:00.000Z"
  }),
  createProduct({
    id: "prd_chair",
    workspaceId,
    status: "needs_info",
    title: "Chaise Delta",
    category: "Mobilier",
    sku: "CD-004",
    description: "Dimensions manquantes",
    createdAt: "2026-06-04T10:00:00.000Z"
  }),
  createProduct({
    id: "prd_deleted",
    workspaceId,
    status: "validated",
    title: "Produit supprimé",
    createdAt: "2026-06-05T09:00:00.000Z",
    deletedAt: "2026-06-06T10:00:00.000Z",
    spaceId: "spc_showroom",
    spaceName: "Showroom"
  }),
  createProduct({
    id: "prd_outside",
    workspaceId: otherWorkspaceId,
    status: "validated",
    title: outsideSentinel,
    category: "Hidden",
    sku: "OUT-999",
    description: outsideSentinel,
    createdAt: "2026-06-05T10:00:00.000Z"
  })
];

const workspaceProducts = getWorkspaceCatalogProducts(sourceProducts, workspaceId);

assert.equal(workspaceProducts.length, 5);
assert.equal(
  workspaceProducts.some((product) => product.title === outsideSentinel),
  false
);

const titleSearch = applyCatalogFilters(
  workspaceProducts,
  normalizeCatalogFilters({ q: "vase" })
);
assert.deepEqual(titleSearch.map((product) => product.id), ["prd_vase"]);

const skuSearch = applyCatalogFilters(
  workspaceProducts,
  normalizeCatalogFilters({ q: "TG-003" })
);
assert.deepEqual(skuSearch.map((product) => product.id), ["prd_table"]);

const validatedOnly = applyCatalogFilters(
  workspaceProducts,
  normalizeCatalogFilters({ status: "validated" })
);
assert.deepEqual(validatedOnly.map((product) => product.id), ["prd_vase"]);

const deletedOnly = applyCatalogFilters(
  workspaceProducts,
  normalizeCatalogFilters({ deleted: "deleted" })
);
assert.deepEqual(deletedOnly.map((product) => product.id), ["prd_deleted"]);

const showroomOnly = applyCatalogFilters(
  workspaceProducts,
  normalizeCatalogFilters({ space: "spc_showroom" })
);
assert.deepEqual(showroomOnly.map((product) => product.id), ["prd_vase"]);

const unassignedOnly = applyCatalogFilters(
  workspaceProducts,
  normalizeCatalogFilters({ space: "unassigned" })
);
assert.deepEqual(
  unassignedOnly.map((product) => product.id),
  ["prd_table", "prd_lampe", "prd_chair"]
);

const draftOnly = applyCatalogFilters(
  workspaceProducts,
  normalizeCatalogFilters({ status: "draft" })
);
assert.deepEqual(draftOnly.map((product) => product.id), ["prd_lampe"]);

const reviewOnly = applyCatalogFilters(
  workspaceProducts,
  normalizeCatalogFilters({ status: "needs_review" })
);
assert.deepEqual(reviewOnly.map((product) => product.id), ["prd_table"]);

const titleAsc = applyCatalogFilters(
  workspaceProducts,
  normalizeCatalogFilters({ sort: "title_asc" })
);
assert.deepEqual(
  titleAsc.map((product) => product.title),
  ["Chaise Delta", "Lampe Beta", "Table Gamma", "Vase Alpha"]
);

const newest = applyCatalogFilters(
  workspaceProducts,
  normalizeCatalogFilters({ sort: "newest" })
);
assert.deepEqual(newest.map((product) => product.id), [
  "prd_chair",
  "prd_lampe",
  "prd_table",
  "prd_vase"
]);

const invalidParams = normalizeCatalogFilters({
  completeness: "bad-completeness",
  q: ["  lampe   beta  "],
  sort: "unknown",
  status: "bad-status"
});
assert.deepEqual(invalidParams, {
  audit: "all",
  completeness: "all",
  deleted: "active",
  importId: "",
  page: 1,
  pageSize: 25,
  q: "lampe beta",
  sort: "oldest",
  space: "all",
  status: "all"
});

const noResult = applyCatalogFilters(
  workspaceProducts,
  normalizeCatalogFilters({ q: "introuvable" })
);
assert.equal(noResult.length, 0);

console.log("Catalog filter coverage passed.");
