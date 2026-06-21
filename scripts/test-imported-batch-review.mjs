import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  applyCatalogFilters,
  getCatalogHref,
  getWorkspaceCatalogProducts,
  normalizeCatalogFilters
} from "../src/server/products/catalog-filters.ts";
import { buildProductImportBatchSummary } from "../src/server/products/import-origin.ts";

function product(input) {
  const draftData = {
    category: "Décoration",
    description: input.description ?? "Description complète",
    dimensions: "20 cm",
    materials: "Bois",
    title: input.title
  };

  return {
    auditStatus: input.auditStatus,
    category: "Décoration",
    clientNotes: null,
    costPrice: null,
    createdAt: input.createdAt,
    currentPrice: null,
    deletedAt: input.deletedAt ?? null,
    description: draftData.description,
    desiredPrice: 120,
    dimensions: "20 cm",
    draftData,
    id: input.id,
    imageUrl: null,
    importId: input.importId ?? null,
    materials: "Bois",
    origin: null,
    sku: null,
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

const workspaceId = "wks_batch_review";
const products = getWorkspaceCatalogProducts(
  [
    product({
      auditStatus: "missing",
      createdAt: "2026-06-19T10:00:00.000Z",
      id: "prd_a_draft",
      importId: "imp_a",
      status: "draft",
      title: "Vase brouillon",
      workspaceId
    }),
    product({
      auditStatus: "stale",
      createdAt: "2026-06-19T10:01:00.000Z",
      id: "prd_a_review",
      importId: "imp_a",
      spaceId: "spc_a",
      spaceName: "Collection A",
      status: "needs_review",
      title: "Lampe à revoir",
      workspaceId
    }),
    product({
      auditStatus: "current",
      createdAt: "2026-06-19T10:02:00.000Z",
      id: "prd_a_validated",
      importId: "imp_a",
      status: "validated",
      title: "Table validée",
      workspaceId
    }),
    product({
      auditStatus: "missing",
      createdAt: "2026-06-19T10:03:00.000Z",
      deletedAt: "2026-06-19T11:00:00.000Z",
      id: "prd_a_deleted",
      importId: "imp_a",
      status: "draft",
      title: "Produit supprimé",
      workspaceId
    }),
    product({
      auditStatus: "missing",
      createdAt: "2026-06-19T10:04:00.000Z",
      id: "prd_b",
      importId: "imp_b",
      status: "draft",
      title: "Import B",
      workspaceId
    }),
    product({
      auditStatus: "missing",
      createdAt: "2026-06-19T10:05:00.000Z",
      id: "prd_manual",
      status: "draft",
      title: "Sans origine",
      workspaceId
    }),
    product({
      auditStatus: "missing",
      createdAt: "2026-06-19T10:06:00.000Z",
      id: "prd_other_workspace",
      importId: "imp_a",
      status: "draft",
      title: "SENTINEL_OTHER_WORKSPACE",
      workspaceId: "wks_other"
    })
  ],
  workspaceId
);

const batch = products.filter((item) => item.importId === "imp_a");
const summary = buildProductImportBatchSummary(batch);
assert.equal(summary.productCount, 4);
assert.equal(summary.draftCount, 1);
assert.equal(summary.needsReviewCount, 1);
assert.equal(summary.validatedCount, 1);
assert.equal(summary.deletedProductCount, 1);
assert.equal(summary.missingAuditCount, 1);
assert.equal(summary.staleAuditCount, 1);
assert.deepEqual(summary.spaceNames, ["Collection A"]);

assert.deepEqual(
  applyCatalogFilters(
    products,
    normalizeCatalogFilters({ import: "imp_a", status: "draft" })
  ).map((item) => item.id),
  ["prd_a_draft"]
);
assert.deepEqual(
  applyCatalogFilters(
    products,
    normalizeCatalogFilters({ audit: "missing", import: "imp_a" })
  ).map((item) => item.id),
  ["prd_a_draft"]
);
assert.deepEqual(
  applyCatalogFilters(
    products,
    normalizeCatalogFilters({ deleted: "deleted", import: "imp_a" })
  ).map((item) => item.id),
  ["prd_a_deleted"]
);
assert.equal(
  products.some((item) => item.title === "SENTINEL_OTHER_WORKSPACE"),
  false
);

const quickFilterHref = getCatalogHref(
  normalizeCatalogFilters({
    import: "imp_a",
    q: "vase",
    space: "spc_a"
  }),
  {
    completeness: "incomplete",
    page: 1,
    status: "all"
  }
);
assert.equal(quickFilterHref.includes("import=imp_a"), true);
assert.equal(quickFilterHref.includes("q=vase"), true);
assert.equal(quickFilterHref.includes("space=spc_a"), true);
assert.equal(quickFilterHref.includes("completeness=incomplete"), true);

const pageSource = await readFile("src/app/catalog/page.tsx", "utf8");
const querySource = await readFile("src/server/products/queries.ts", "utf8");
const combinedSource = `${pageSource}\n${querySource}`;
for (const label of [
  "Revue du lot",
  "Voir les incomplets",
  "Voir les brouillons",
  "Voir les produits sans audit",
  "Lancer l’audit du lot",
  "Masquer les produits de cet import",
  "Restaurer les produits de cet import"
]) {
  assert.equal(pageSource.includes(label), true);
}
assert.match(querySource, /eq\(imports\.workspaceId, access\.workspaceId\)/);
assert.equal(combinedSource.includes("storagePath"), false);
assert.equal(combinedSource.includes("AUTH_SESSION_SECRET"), false);
assert.equal(/\/Users\/|[A-Z]:\\/.test(combinedSource), false);

console.log("Imported batch review coverage passed.");
