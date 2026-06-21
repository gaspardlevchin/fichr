import assert from "node:assert/strict";

import {
  analyzeProductCompleteness,
  getProductStatusLabel
} from "../src/lib/product-completeness.ts";

function createProduct(overrides = {}) {
  const draftData = {
    title: "Vase Atelier",
    subtitle: "Piece emaillee",
    category: "Decoration",
    description:
      "Vase emaille pour table ou console, avec informations matiere et usage a controler avant publication.",
    materials: "Ceramique emaillee",
    dimensions: "28 x 12 cm",
    origin: "France",
    current_price: 120,
    desired_price: 150,
    cost_price: 60,
    target_margin: 0.6,
    sku: "VAS-001",
    image_url: "https://example.com/vase.jpg",
    client_notes: "Piece prioritaire"
  };

  const nextDraftData = {
    ...draftData,
    ...(overrides.draftData ?? {})
  };

  return {
    category: nextDraftData.category ?? null,
    clientNotes: nextDraftData.client_notes ?? null,
    costPrice:
      typeof nextDraftData.cost_price === "number"
        ? nextDraftData.cost_price
        : null,
    currentPrice:
      typeof nextDraftData.current_price === "number"
        ? nextDraftData.current_price
        : null,
    description: nextDraftData.description ?? null,
    desiredPrice:
      typeof nextDraftData.desired_price === "number"
        ? nextDraftData.desired_price
        : null,
    dimensions: nextDraftData.dimensions ?? null,
    draftData: nextDraftData,
    imageUrl: nextDraftData.image_url ?? null,
    materials: nextDraftData.materials ?? null,
    origin: nextDraftData.origin ?? null,
    sku: nextDraftData.sku ?? null,
    status: overrides.status ?? "draft",
    subtitle: nextDraftData.subtitle ?? null,
    targetMargin:
      typeof nextDraftData.target_margin === "number"
        ? nextDraftData.target_margin
        : null,
    title: nextDraftData.title ?? "Produit sans titre",
    validatedData: overrides.validatedData ?? null,
    ...overrides
  };
}

process.env.AI_ENABLED = "false";
globalThis.fetch = () => {
  throw new Error("OpenAI must not be called by product completeness.");
};

const completeProduct = createProduct();
const completeSnapshot = JSON.stringify(completeProduct);
const complete = analyzeProductCompleteness(completeProduct);

assert.equal(complete.status, "ready_to_validate");
assert.equal(complete.statusLabel, "Prête à valider");
assert.equal(complete.completenessScore >= 95, true);
assert.equal(complete.blockers.length, 0);
assert.equal(complete.missingRequiredFields.length, 0);
assert.equal(JSON.stringify(completeProduct), completeSnapshot);

const missingTitle = analyzeProductCompleteness(
  createProduct({
    draftData: {
      title: ""
    },
    title: "Produit sans titre - ligne 2"
  })
);
assert.equal(
  missingTitle.blockers.some((issue) => issue.field === "title"),
  true
);
assert.equal(missingTitle.status, "needs_completion");

const missingDescription = analyzeProductCompleteness(
  createProduct({
    description: null,
    draftData: {
      description: ""
    }
  })
);
assert.equal(
  missingDescription.blockers.some((issue) => issue.field === "description"),
  true
);

const missingMaterials = analyzeProductCompleteness(
  createProduct({
    materials: null,
    draftData: {
      materials: ""
    }
  })
);
assert.equal(missingMaterials.blockers.length, 0);
assert.equal(
  missingMaterials.missingRecommendedFields.some(
    (issue) => issue.field === "materials"
  ),
  true
);
assert.equal(missingMaterials.status, "needs_review");

const invalidPrice = analyzeProductCompleteness(
  createProduct({
    currentPrice: null,
    desiredPrice: null,
    draftData: {
      current_price: "abc",
      desired_price: ""
    }
  })
);
assert.equal(
  invalidPrice.blockers.some((issue) => issue.field === "price"),
  true
);

const priceBelowCost = analyzeProductCompleteness(
  createProduct({
    draftData: {
      desired_price: 40,
      cost_price: 60
    }
  })
);
assert.equal(priceBelowCost.blockers.length, 0);
assert.equal(
  priceBelowCost.warnings.some((issue) => issue.field === "desired_price"),
  true
);

const validatedProduct = analyzeProductCompleteness(
  createProduct({ status: "validated" })
);
assert.equal(validatedProduct.status, "validated");
assert.equal(validatedProduct.statusLabel, "Validée");

assert.equal(getProductStatusLabel("draft"), "Brouillon");
assert.equal(getProductStatusLabel("needs_info"), "Incomplet");
assert.equal(getProductStatusLabel("needs_review"), "À vérifier");
assert.equal(getProductStatusLabel("validated"), "Validé");

console.log("Product completeness coverage passed.");
