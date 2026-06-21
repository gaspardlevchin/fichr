import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  analyzeProductCompleteness,
  getCatalogProductActionHref,
  getFirstProductCompletenessQuickAction,
  getProductCompletenessQuickActionTargetId,
  getProductCompletenessTargetHref,
  getProductCompletenessTargetId
} from "../src/lib/product-completeness.ts";

function createProduct(overrides = {}) {
  const draftData = {
    title: "Vase Atelier",
    subtitle: "Piece emaillee",
    category: "Decoration",
    description:
      "Vase emaille pour table ou console, avec toutes les informations utiles avant validation.",
    materials: "Ceramique",
    dimensions: "28 x 12 cm",
    origin: "France",
    current_price: 120,
    desired_price: 150,
    cost_price: 60,
    target_margin: 0.6,
    sku: "VAS-001",
    image_url: "https://example.com/vase.jpg",
    client_notes: "Piece prioritaire",
    ...(overrides.draftData ?? {})
  };

  return {
    category: draftData.category ?? null,
    clientNotes: draftData.client_notes ?? null,
    costPrice:
      typeof draftData.cost_price === "number" ? draftData.cost_price : null,
    currentPrice:
      typeof draftData.current_price === "number"
        ? draftData.current_price
        : null,
    description: draftData.description ?? null,
    desiredPrice:
      typeof draftData.desired_price === "number"
        ? draftData.desired_price
        : null,
    dimensions: draftData.dimensions ?? null,
    draftData,
    imageUrl: draftData.image_url ?? null,
    materials: draftData.materials ?? null,
    origin: draftData.origin ?? null,
    sku: draftData.sku ?? null,
    status: overrides.status ?? "draft",
    subtitle: draftData.subtitle ?? null,
    targetMargin:
      typeof draftData.target_margin === "number"
        ? draftData.target_margin
        : null,
    title: overrides.title ?? draftData.title ?? "Produit sans titre",
    validatedData: overrides.validatedData ?? null
  };
}

process.env.AI_ENABLED = "false";
globalThis.fetch = () => {
  throw new Error("OpenAI must not be called by completeness navigation.");
};

assert.equal(getProductCompletenessTargetHref("title"), "#field-title");
assert.equal(
  getProductCompletenessTargetHref("description"),
  "#field-description"
);
assert.equal(getProductCompletenessTargetHref("price"), "#field-price");
assert.equal(
  getProductCompletenessTargetHref("target_price"),
  "#field-target_price"
);
assert.equal(
  getProductCompletenessTargetHref("image_url"),
  "#field-image_url"
);
assert.equal(getProductCompletenessTargetHref("audit"), "#product-audit");
assert.equal(
  getProductCompletenessTargetHref("validation"),
  "#product-validation"
);
assert.equal(getProductCompletenessTargetHref("media"), "#product-media");

const fallbackAction = {
  blocking: false,
  description: "Fallback",
  id: "fallback",
  label: "Fallback",
  priority: 99,
  severity: "warning",
  type: "edit_field"
};
assert.equal(
  getProductCompletenessQuickActionTargetId(fallbackAction),
  "product-edit"
);

const blockedProduct = createProduct({
  draftData: { title: "" },
  title: "Produit sans titre - ligne 1"
});
const blockedSnapshot = JSON.stringify(blockedProduct);
const blocked = analyzeProductCompleteness(blockedProduct);
const firstBlocking = getFirstProductCompletenessQuickAction(
  blocked.quickActions,
  "blocking"
);
assert.equal(firstBlocking?.id, "add-title");
assert.equal(
  firstBlocking
    ? getProductCompletenessQuickActionTargetId(firstBlocking)
    : null,
  "field-title"
);
assert.equal(
  getCatalogProductActionHref({
    completeness: blocked,
    completenessIndicator: "blocked",
    id: "prd_blocked",
    status: "needs_info"
  }),
  "/products/prd_blocked#field-title"
);

const incompleteProduct = createProduct({
  draftData: { materials: "" }
});
const incompleteSnapshot = JSON.stringify(incompleteProduct);
const incomplete = analyzeProductCompleteness(incompleteProduct);
const firstRecommended = getFirstProductCompletenessQuickAction(
  incomplete.quickActions,
  "recommended"
);
assert.equal(firstRecommended?.id, "add-materials");
assert.equal(
  getCatalogProductActionHref({
    completeness: incomplete,
    completenessIndicator: "incomplete",
    id: "prd_incomplete",
    status: "draft"
  }),
  "/products/prd_incomplete#field-materials"
);

const ready = analyzeProductCompleteness(createProduct());
assert.equal(
  getCatalogProductActionHref({
    completeness: ready,
    completenessIndicator: "complete",
    id: "prd_ready",
    status: "draft"
  }),
  "/products/prd_ready#product-validation"
);
assert.equal(
  getCatalogProductActionHref({
    completeness: ready,
    completenessIndicator: "complete",
    id: "prd_validated",
    status: "validated"
  }),
  "/products/prd_validated#product-validation"
);

assert.equal(JSON.stringify(blockedProduct), blockedSnapshot);
assert.equal(JSON.stringify(incompleteProduct), incompleteSnapshot);
assert.equal(blockedProduct.validatedData, null);
assert.equal(incompleteProduct.validatedData, null);

const productPageSource = readFileSync(
  new URL("../src/app/products/[productId]/page.tsx", import.meta.url),
  "utf8"
);
assert.equal(
  productPageSource.includes("productCompletenessSectionTargetIds.media"),
  true
);
assert.equal(
  productPageSource.includes("productCompletenessSectionTargetIds.edition"),
  true
);
assert.equal(
  productPageSource.includes("productCompletenessSectionTargetIds.audit"),
  true
);
assert.equal(
  productPageSource.includes("productCompletenessSectionTargetIds.validation"),
  true
);
assert.equal(productPageSource.includes("getProductFieldId(field)"), true);

const catalogSource = readFileSync(
  new URL(
    "../src/components/catalog/catalog-bulk-export-form.tsx",
    import.meta.url
  ),
  "utf8"
);
assert.equal(catalogSource.includes("getCatalogProductActionHref(product)"), true);
assert.equal(getProductCompletenessTargetId("edition"), "product-edit");

console.log("Product completeness navigation coverage passed.");
