import assert from "node:assert/strict";

import {
  applyCatalogFilters,
  getCatalogHref,
  getWorkspaceCatalogProducts,
  normalizeCatalogFilters
} from "../src/server/products/catalog-filters.ts";
import { resolveExportProductSelection } from "../src/server/exports/core.ts";

const workspaceId = "wks_catalog_completeness";
const otherWorkspaceId = "wks_catalog_completeness_other";
const outsideSentinel = "OUTSIDE_COMPLETENESS_SENTINEL";

function createProduct(input) {
  const draftData = input.draftData ?? {
    title: input.title,
    subtitle: input.subtitle ?? null,
    category: input.category ?? null,
    description: input.description ?? null,
    materials: input.materials ?? null,
    dimensions: input.dimensions ?? null,
    origin: input.origin ?? null,
    current_price: input.currentPrice ?? null,
    desired_price: input.desiredPrice ?? null,
    cost_price: input.costPrice ?? null,
    target_margin: input.targetMargin ?? null,
    sku: input.sku ?? null,
    image_url: input.imageUrl ?? null,
    client_notes: input.clientNotes ?? null
  };

  return {
    category: input.category ?? null,
    clientNotes: input.clientNotes ?? null,
    costPrice: input.costPrice ?? null,
    createdAt: input.createdAt,
    currentPrice: input.currentPrice ?? null,
    description: input.description ?? null,
    desiredPrice: input.desiredPrice ?? null,
    dimensions: input.dimensions ?? null,
    draftData,
    id: input.id,
    imageUrl: input.imageUrl ?? null,
    importId: input.importId ?? null,
    materials: input.materials ?? null,
    origin: input.origin ?? null,
    sku: input.sku ?? null,
    status: input.status,
    subtitle: input.subtitle ?? null,
    targetMargin: input.targetMargin ?? null,
    title: input.title,
    validatedData: input.validatedData ?? null,
    workspaceId: input.workspaceId
  };
}

function createCompleteDraft(input) {
  return createProduct({
    category: "Decoration",
    clientNotes: "Prioritaire",
    costPrice: 60,
    currentPrice: 120,
    description:
      "Description produit complete avec usage, contexte et informations utiles pour la validation.",
    desiredPrice: 150,
    dimensions: "28 x 12 cm",
    imageUrl: "https://example.com/image.jpg",
    materials: "Ceramique",
    origin: "France",
    sku: "SKU-COMPLETE",
    status: "draft",
    subtitle: "Piece atelier",
    targetMargin: 0.6,
    workspaceId,
    ...input
  });
}

process.env.AI_ENABLED = "false";
globalThis.fetch = () => {
  throw new Error("OpenAI must not be called by catalog completeness.");
};

const sourceProducts = [
  createProduct({
    id: "prd_blocked",
    workspaceId,
    status: "needs_info",
    title: "Produit sans titre - ligne 1",
    category: "Decoration",
    description:
      "Description presente mais le titre temporaire et le prix restent bloquants.",
    currentPrice: null,
    createdAt: "2026-06-01T10:00:00.000Z",
    draftData: {
      title: "",
      category: "Decoration",
      description:
        "Description presente mais le titre temporaire et le prix restent bloquants.",
      current_price: "abc"
    }
  }),
  createProduct({
    id: "prd_incomplete",
    workspaceId,
    status: "draft",
    title: "Lampe Incomplete",
    category: "Luminaire",
    description:
      "Fiche avec les champs essentiels, mais plusieurs informations recommandees manquent encore.",
    currentPrice: 90,
    createdAt: "2026-06-02T10:00:00.000Z"
  }),
  createCompleteDraft({
    id: "prd_ready",
    title: "Table Ready",
    desiredPrice: 40,
    costPrice: 60,
    createdAt: "2026-06-03T10:00:00.000Z",
    draftData: {
      title: "Table Ready",
      subtitle: "Piece atelier",
      category: "Mobilier",
      description:
        "Description produit complete avec usage, contexte et informations utiles pour la validation.",
      materials: "Bois",
      dimensions: "80 x 40 cm",
      origin: "France",
      current_price: 120,
      desired_price: 40,
      cost_price: 60,
      target_margin: 0.6,
      sku: "READY-001",
      image_url: "https://example.com/ready.jpg",
      client_notes: "Prix a verifier"
    }
  }),
  createCompleteDraft({
    id: "prd_complete",
    title: "Vase Complete",
    createdAt: "2026-06-04T10:00:00.000Z"
  }),
  createCompleteDraft({
    id: "prd_validated",
    title: "Vase Valide",
    status: "validated",
    createdAt: "2026-06-05T10:00:00.000Z",
    validatedData: {
      title: "Vase Valide",
      description: "Snapshot valide"
    }
  }),
  createCompleteDraft({
    id: "prd_outside",
    title: outsideSentinel,
    workspaceId: otherWorkspaceId,
    createdAt: "2026-06-06T10:00:00.000Z"
  })
];
const sourceSnapshot = JSON.stringify(sourceProducts);
const workspaceProducts = getWorkspaceCatalogProducts(sourceProducts, workspaceId);

assert.equal(workspaceProducts.length, 5);
assert.equal(
  workspaceProducts.some((product) => product.title === outsideSentinel),
  false
);

const blocked = applyCatalogFilters(
  workspaceProducts,
  normalizeCatalogFilters({ completeness: "blocked" })
);
assert.deepEqual(blocked.map((product) => product.id), ["prd_blocked"]);
assert.equal(blocked[0]?.completenessIndicator, "blocked");

const incomplete = applyCatalogFilters(
  workspaceProducts,
  normalizeCatalogFilters({ completeness: "incomplete" })
);
assert.deepEqual(incomplete.map((product) => product.id), ["prd_incomplete"]);
assert.equal(incomplete[0]?.completenessIndicator, "incomplete");

const ready = applyCatalogFilters(
  workspaceProducts,
  normalizeCatalogFilters({ completeness: "ready" })
);
assert.equal(ready.some((product) => product.id === "prd_ready"), true);
assert.equal(ready.some((product) => product.id === "prd_complete"), true);
assert.equal(
  ready.every((product) => product.completeness.blockers.length === 0),
  true
);

const complete = applyCatalogFilters(
  workspaceProducts,
  normalizeCatalogFilters({ completeness: "complete" })
);
assert.deepEqual(complete.map((product) => product.id), [
  "prd_complete",
  "prd_validated"
]);
assert.equal(
  complete.every((product) => product.completenessIndicator === "complete"),
  true
);

const invalidCompleteness = normalizeCatalogFilters({
  completeness: "bad-completeness"
});
assert.equal(invalidCompleteness.completeness, "all");

const combined = applyCatalogFilters(
  workspaceProducts,
  normalizeCatalogFilters({
    completeness: "complete",
    q: "vase",
    status: "draft"
  })
);
assert.deepEqual(combined.map((product) => product.id), ["prd_complete"]);

const sortedAsc = applyCatalogFilters(
  workspaceProducts,
  normalizeCatalogFilters({ sort: "completeness_asc" })
);
const sortedDesc = applyCatalogFilters(
  workspaceProducts,
  normalizeCatalogFilters({ sort: "completeness_desc" })
);
assert.equal(sortedAsc[0]?.id, "prd_blocked");
assert.equal(sortedDesc[0]?.completeness.completenessScore, 100);

assert.equal(
  getCatalogHref(
    {
      ...normalizeCatalogFilters({
        completeness: "ready",
        pageSize: "50",
        q: "vase",
        sort: "completeness_desc",
        status: "draft"
      }),
      page: 1
    },
    { page: 2 }
  ),
  "/catalog?q=vase&completeness=ready&status=draft&sort=completeness_desc&page=2&pageSize=50"
);

assert.throws(
  () =>
    resolveExportProductSelection(
      [
        {
          id: "prd_complete",
          status: "draft",
          title: "Vase Complete",
          validatedData: {
            title: "Draft complete should not export"
          }
        }
      ],
      ["prd_complete"]
    ),
  /non valides/
);
const selectedValidated = resolveExportProductSelection(
  [
    {
      id: "prd_validated",
      status: "validated",
      title: "Vase Valide",
      validatedData: {
        title: "Vase Valide"
      }
    }
  ],
  ["prd_validated"]
);
assert.equal(selectedValidated.exportProducts.length, 1);

assert.equal(JSON.stringify(sourceProducts), sourceSnapshot);

console.log("Catalog completeness coverage passed.");
