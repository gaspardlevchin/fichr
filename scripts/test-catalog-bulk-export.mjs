import assert from "node:assert/strict";

import {
  applyCatalogFilters,
  getCatalogHref,
  getWorkspaceCatalogProducts,
  normalizeCatalogFilters,
  paginateCatalogProducts
} from "../src/server/products/catalog-filters.ts";
import {
  renderCsvExport,
  renderTextExport,
  resolveExportProductSelection
} from "../src/server/exports/core.ts";
import { renderPdfExport } from "../src/server/exports/pdf.ts";

const workspaceId = "wks_catalog_bulk";
const otherWorkspaceId = "wks_catalog_bulk_other";
const draftSentinel = "CATALOG_DRAFT_SENTINEL_DO_NOT_EXPORT";
const outsideSentinel = "CATALOG_OUTSIDE_SENTINEL_DO_NOT_EXPORT";

function createProduct(input) {
  return {
    category: input.category ?? null,
    createdAt: input.createdAt,
    currentPrice: input.currentPrice ?? null,
    description: input.description ?? null,
    desiredPrice: input.desiredPrice ?? null,
    id: input.id,
    imageUrl: null,
    importId: input.importId ?? null,
    sku: input.sku ?? null,
    status: input.status,
    subtitle: input.subtitle ?? null,
    title: input.title,
    workspaceId: input.workspaceId
  };
}

function createExportRow(input) {
  return {
    category: input.category ?? null,
    id: input.id,
    sku: input.sku ?? null,
    status: input.status,
    title: input.title,
    validatedData: input.validatedData ?? null
  };
}

function expectSelectionRejected(callback, message) {
  assert.throws(callback, /Selectionnez|introuvables|non valides/, message);
}

function assertNoExportLeak(value) {
  assert.equal(value.includes(draftSentinel), false);
  assert.equal(value.includes(outsideSentinel), false);
  assert.equal(value.includes("Raw Draft Title"), false);
}

function toPdfHex(value) {
  return Buffer.from(value, "latin1").toString("hex").toUpperCase();
}

function assertPdfIncludes(pdf, value) {
  assert.equal(pdf.includes(toPdfHex(value)), true, `PDF should include ${value}`);
}

function assertPdfExcludes(pdf, value) {
  assert.equal(pdf.includes(toPdfHex(value)), false, `PDF should exclude ${value}`);
}

const catalogSourceProducts = [
  createProduct({
    id: "prd_alpha",
    workspaceId,
    status: "validated",
    title: "Alpha Vase",
    category: "Decoration",
    sku: "ALPHA-001",
    description: "Piece validee",
    createdAt: "2026-06-01T10:00:00.000Z"
  }),
  createProduct({
    id: "prd_beta",
    workspaceId,
    status: "validated",
    title: "Beta Lampe",
    category: "Luminaire",
    sku: "BETA-002",
    description: "Piece validee",
    createdAt: "2026-06-02T10:00:00.000Z"
  }),
  createProduct({
    id: "prd_gamma",
    workspaceId,
    status: "needs_review",
    title: "Gamma Table",
    category: "Mobilier",
    sku: "GAMMA-003",
    description: "A revoir",
    createdAt: "2026-06-03T10:00:00.000Z"
  }),
  createProduct({
    id: "prd_delta",
    workspaceId,
    status: "draft",
    title: "Delta Chaise",
    category: "Mobilier",
    sku: "DELTA-004",
    description: "Brouillon",
    createdAt: "2026-06-04T10:00:00.000Z"
  }),
  createProduct({
    id: "prd_epsilon",
    workspaceId,
    status: "validated",
    title: "Epsilon Banc",
    category: "Mobilier",
    sku: "EPS-005",
    description: "Piece validee",
    createdAt: "2026-06-05T10:00:00.000Z"
  }),
  createProduct({
    id: "prd_outside",
    workspaceId: otherWorkspaceId,
    status: "validated",
    title: outsideSentinel,
    category: "Hidden",
    sku: "OUT-999",
    description: outsideSentinel,
    createdAt: "2026-06-06T10:00:00.000Z"
  })
];

const workspaceProducts = getWorkspaceCatalogProducts(
  catalogSourceProducts,
  workspaceId
);
const paginationProducts = Array.from({ length: 30 }, (_, index) => {
  const number = String(index + 1).padStart(2, "0");

  return createProduct({
    id: `prd_page_${number}`,
    workspaceId,
    status: "validated",
    title: `Page Product ${number}`,
    category: "Pagination",
    sku: `PAGE-${number}`,
    description: "Produit de pagination",
    createdAt: `2026-06-${number}T10:00:00.000Z`
  });
});
const firstPageFilters = normalizeCatalogFilters({
  page: "1",
  sort: "title_asc"
});
const firstPage = paginateCatalogProducts(paginationProducts, firstPageFilters);
assert.equal(firstPage.products.length, 25);
assert.equal(firstPage.products[0]?.id, "prd_page_01");
assert.equal(firstPage.products[24]?.id, "prd_page_25");
assert.equal(firstPage.pagination.start, 1);
assert.equal(firstPage.pagination.end, 25);
assert.equal(firstPage.pagination.pageCount, 2);

const secondPage = paginateCatalogProducts(paginationProducts, {
  ...firstPageFilters,
  page: 2
});
assert.equal(secondPage.products.length, 5);
assert.equal(secondPage.products[0]?.id, "prd_page_26");
assert.equal(secondPage.products[4]?.id, "prd_page_30");

const invalidPageFilters = normalizeCatalogFilters({
  page: "99",
  pageSize: "bad",
  q: "mobilier",
  sort: "title_asc",
  status: "validated"
});
assert.equal(invalidPageFilters.pageSize, 25);
const filteredProducts = applyCatalogFilters(workspaceProducts, invalidPageFilters);
const normalizedPage = paginateCatalogProducts(filteredProducts, invalidPageFilters);
assert.equal(normalizedPage.pagination.page, 1);
assert.deepEqual(normalizedPage.products.map((product) => product.id), [
  "prd_epsilon"
]);

assert.equal(
  getCatalogHref(
    {
      ...normalizeCatalogFilters({
        pageSize: "50",
        q: "vase",
        sort: "title_asc",
        status: "validated"
      }),
      page: 1
    },
    { page: 2 }
  ),
  "/catalog?q=vase&status=validated&sort=title_asc&page=2&pageSize=50"
);

const exportRows = [
  createExportRow({
    id: "prd_alpha",
    status: "validated",
    title: "Raw Alpha Title",
    category: "Decoration",
    sku: "ALPHA-001",
    validatedData: {
      title: "Validated Alpha",
      description: "Validated alpha description",
      sku: "ALPHA-001"
    }
  }),
  createExportRow({
    id: "prd_beta",
    status: "validated",
    title: "Raw Beta Title",
    category: "Luminaire",
    sku: "BETA-002",
    validatedData: {
      title: "Validated Beta",
      description: "Validated beta description",
      sku: "BETA-002"
    }
  }),
  createExportRow({
    id: "prd_delta",
    status: "draft",
    title: "Raw Draft Title",
    category: "Mobilier",
    sku: "DELTA-004",
    validatedData: {
      title: draftSentinel,
      description: draftSentinel
    }
  })
];

expectSelectionRejected(
  () => resolveExportProductSelection(exportRows, []),
  "empty catalog selection must be rejected"
);
expectSelectionRejected(
  () => resolveExportProductSelection(exportRows, ["prd_delta"]),
  "non-validated catalog product must be rejected"
);
expectSelectionRejected(
  () => resolveExportProductSelection(exportRows, ["prd_outside"]),
  "out-of-workspace catalog product must be rejected"
);

const selectedAlpha = resolveExportProductSelection(exportRows, ["prd_alpha"]);
assert.equal(selectedAlpha.exportProducts.length, 1);
assert.equal(selectedAlpha.selectedProductCount, 1);
assert.equal(selectedAlpha.skippedProductCount, 0);

const selectedText = renderTextExport(selectedAlpha.exportProducts);
assert.equal(selectedText.includes("Validated Alpha"), true);
assert.equal(selectedText.includes("Validated Beta"), false);
assert.equal(selectedText.includes("Raw Alpha Title"), false);
assertNoExportLeak(selectedText);

const selectedCsv = renderCsvExport(selectedAlpha.exportProducts);
assert.equal(selectedCsv.includes("Validated Alpha"), true);
assert.equal(selectedCsv.includes("Validated Beta"), false);
assert.equal(selectedCsv.includes("Raw Alpha Title"), false);
assertNoExportLeak(selectedCsv);

const selectedPdf = renderPdfExport(selectedAlpha.exportProducts).toString("latin1");
assert.equal(selectedPdf.startsWith("%PDF-1.4"), true);
assertPdfIncludes(selectedPdf, "Validated Alpha");
assertPdfExcludes(selectedPdf, "Validated Beta");
assertPdfExcludes(selectedPdf, draftSentinel);
assertPdfExcludes(selectedPdf, outsideSentinel);

console.log("Catalog bulk export coverage passed.");
