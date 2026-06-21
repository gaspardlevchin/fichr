import assert from "node:assert/strict";

import {
  addAuditQuickAction,
  analyzeProductCompleteness,
  getTopProductCompletenessQuickActions
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

function getAction(result, id) {
  return result.quickActions.find((action) => action.id === id);
}

process.env.AI_ENABLED = "false";
globalThis.fetch = () => {
  throw new Error("OpenAI must not be called by product quick actions.");
};

const missingTitleProduct = createProduct({
  draftData: { title: "" },
  title: "Produit sans titre - ligne 7"
});
const missingTitleSnapshot = JSON.stringify(missingTitleProduct);
const missingTitle = analyzeProductCompleteness(missingTitleProduct);
assert.equal(getAction(missingTitle, "add-title")?.label, "Ajouter un titre");
assert.equal(getAction(missingTitle, "add-title")?.severity, "blocking");
assert.equal(getAction(missingTitle, "add-title")?.priority, 10);
assert.equal(getAction(missingTitle, "add-title")?.blocking, true);
assert.equal(getAction(missingTitle, "add-title")?.targetField, "title");

const missingCategory = analyzeProductCompleteness(
  createProduct({
    category: null,
    draftData: { category: "" }
  })
);
assert.equal(
  getAction(missingCategory, "choose-category")?.label,
  "Choisir une catégorie"
);
assert.equal(getAction(missingCategory, "choose-category")?.severity, "blocking");

const missingDescription = analyzeProductCompleteness(
  createProduct({
    description: null,
    draftData: { description: "" }
  })
);
assert.equal(
  getAction(missingDescription, "add-description")?.targetField,
  "description"
);

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
assert.equal(getAction(invalidPrice, "fix-price")?.label, "Corriger le prix");
assert.equal(getAction(invalidPrice, "fix-price")?.type, "fix_value");

const missingRecommended = analyzeProductCompleteness(
  createProduct({
    imageUrl: null,
    materials: null,
    origin: null,
    draftData: {
      image_url: "",
      materials: "",
      origin: ""
    }
  })
);
assert.equal(getAction(missingRecommended, "add-materials")?.severity, "recommended");
assert.equal(getAction(missingRecommended, "add-materials")?.blocking, false);
assert.equal(getAction(missingRecommended, "add-origin")?.severity, "recommended");
assert.equal(getAction(missingRecommended, "add-image")?.type, "add_media");

const targetBelowCost = analyzeProductCompleteness(
  createProduct({
    draftData: {
      desired_price: 40,
      cost_price: 60
    }
  })
);
assert.equal(
  getAction(targetBelowCost, "review-target-price-cost")?.label,
  "Vérifier la cohérence prix cible / coût"
);
assert.equal(
  getAction(targetBelowCost, "review-target-price-cost")?.severity,
  "warning"
);

const ready = analyzeProductCompleteness(createProduct());
assert.equal(getAction(ready, "validate-product")?.label, "Valider la fiche");
assert.equal(getAction(ready, "validate-product")?.href, "#product-validation");

const validated = analyzeProductCompleteness(
  createProduct({ status: "validated" })
);
assert.equal(getAction(validated, "validate-product"), undefined);
assert.equal(getAction(validated, "validated-product")?.label, "Fiche validée");

const priorities = missingRecommended.quickActions.map(
  (action) => action.priority
);
assert.deepEqual(priorities, [...priorities].sort((left, right) => left - right));
assert.equal(getTopProductCompletenessQuickActions(ready.quickActions, 1).length, 1);

const withAudit = addAuditQuickAction(ready.quickActions, "stale");
assert.equal(withAudit.some((action) => action.id === "rerun-audit"), true);
assert.equal(addAuditQuickAction(ready.quickActions, "current").length, ready.quickActions.length);

assert.equal(JSON.stringify(missingTitleProduct), missingTitleSnapshot);

console.log("Product completeness quick actions coverage passed.");
