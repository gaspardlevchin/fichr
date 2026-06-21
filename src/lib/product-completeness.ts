import type { ProductFieldKey } from "@/types/import";
import type {
  ProductDraftData,
  ProductDraftValue,
  ProductStatus
} from "@/types/product";
export { getProductStatusLabel } from "./product-status.ts";

export type ProductCompletenessStatus =
  | "needs_completion"
  | "needs_review"
  | "ready_to_validate"
  | "validated";
export type ProductCompletenessIndicator =
  | "blocked"
  | "incomplete"
  | "ready"
  | "complete";
export type ProductCompletenessQuickActionType =
  | "edit_field"
  | "fix_value"
  | "add_media"
  | "review_warning"
  | "run_audit"
  | "validate_product";
export type ProductCompletenessQuickActionSeverity =
  | "blocking"
  | "recommended"
  | "warning"
  | "ready";
export type ProductCompletenessNavigationTarget =
  | ProductFieldKey
  | "price"
  | "target_price"
  | "audit"
  | "validation"
  | "media"
  | "edition";

export type ProductCompletenessIssue = {
  field: ProductFieldKey | "price";
  label: string;
  message: string;
};

export type ProductCompletenessQuickAction = {
  anchor?: string;
  blocking: boolean;
  completed?: boolean;
  description: string;
  href?: string;
  id: string;
  label: string;
  priority: number;
  severity: ProductCompletenessQuickActionSeverity;
  targetField?: ProductFieldKey;
  type: ProductCompletenessQuickActionType;
};

export type ProductCompletenessResult = {
  blockers: ProductCompletenessIssue[];
  completenessScore: number;
  missingRecommendedFields: ProductCompletenessIssue[];
  missingRequiredFields: ProductCompletenessIssue[];
  nextActions: string[];
  quickActions: ProductCompletenessQuickAction[];
  status: ProductCompletenessStatus;
  statusLabel: string;
  warnings: ProductCompletenessIssue[];
};

export type ProductCompletenessSource = {
  category: string | null;
  clientNotes?: string | null;
  costPrice: number | null;
  currentPrice: number | null;
  description: string | null;
  desiredPrice: number | null;
  dimensions: string | null;
  draftData: ProductDraftData;
  imageUrl: string | null;
  materials: string | null;
  origin: string | null;
  sku: string | null;
  status: ProductStatus;
  subtitle: string | null;
  targetMargin?: number | null;
  title: string;
  validatedData?: ProductDraftData | null;
};

const completenessStatusLabels: Record<ProductCompletenessStatus, string> = {
  needs_completion: "À compléter",
  needs_review: "À vérifier",
  ready_to_validate: "Prête à valider",
  validated: "Validée"
};
const completenessIndicatorLabels: Record<ProductCompletenessIndicator, string> = {
  blocked: "Bloquant",
  incomplete: "À compléter",
  ready: "Prêt à valider",
  complete: "Complet"
};

const fieldLabels: Record<ProductFieldKey | "price", string> = {
  title: "Titre",
  subtitle: "Sous-titre",
  category: "Catégorie",
  description: "Description",
  materials: "Matières",
  dimensions: "Dimensions",
  origin: "Origine",
  current_price: "Prix actuel",
  desired_price: "Prix souhaité",
  cost_price: "Prix de revient",
  target_margin: "Marge cible",
  sku: "SKU",
  image_url: "Image URL",
  client_notes: "Notes client",
  price: "Prix"
};

const requiredFields: ProductFieldKey[] = [
  "title",
  "category",
  "description"
];
const recommendedFields: ProductFieldKey[] = [
  "subtitle",
  "sku",
  "materials",
  "origin",
  "dimensions",
  "image_url"
];
const displayQuickActionCount = 6;
export const productCompletenessSectionTargetIds = {
  audit: "product-audit",
  edition: "product-edit",
  media: "product-media",
  validation: "product-validation"
} as const;

export function getProductCompletenessStatusLabel(
  status: ProductCompletenessStatus
): string {
  return completenessStatusLabels[status];
}

export function getProductCompletenessIndicatorLabel(
  indicator: ProductCompletenessIndicator
): string {
  return completenessIndicatorLabels[indicator];
}

export function getProductCompletenessIndicator(
  completeness: ProductCompletenessResult
): ProductCompletenessIndicator {
  if (completeness.blockers.length > 0) {
    return "blocked";
  }

  if (completeness.missingRecommendedFields.length > 0) {
    return "incomplete";
  }

  if (completeness.warnings.length === 0) {
    return "complete";
  }

  return "ready";
}

function hasDraftField(
  draftData: ProductDraftData,
  field: ProductFieldKey
): boolean {
  return Object.hasOwn(draftData, field);
}

function getFieldValue(
  product: ProductCompletenessSource,
  field: ProductFieldKey
): ProductDraftValue | string | null | undefined {
  if (hasDraftField(product.draftData, field)) {
    return product.draftData[field];
  }

  const flatValues: Record<ProductFieldKey, ProductDraftValue> = {
    title: product.title,
    subtitle: product.subtitle,
    category: product.category,
    description: product.description,
    materials: product.materials,
    dimensions: product.dimensions,
    origin: product.origin,
    current_price: product.currentPrice,
    desired_price: product.desiredPrice,
    cost_price: product.costPrice,
    target_margin: product.targetMargin ?? null,
    sku: product.sku,
    image_url: product.imageUrl,
    client_notes: product.clientNotes ?? null
  };

  return flatValues[field];
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isMissing(value: unknown): boolean {
  return value === null || value === undefined || normalizeText(value) === "";
}

function createIssue(
  field: ProductFieldKey | "price",
  message: string
): ProductCompletenessIssue {
  return {
    field,
    label: fieldLabels[field],
    message
  };
}

function isTemporaryTitle(product: ProductCompletenessSource): boolean {
  return product.title.startsWith("Produit sans titre");
}

function parsePrice(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const normalized = value
    .replace(/[€\s\u00a0]/g, "")
    .replace(",", ".")
    .trim();

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function hasInvalidPriceValue(
  product: ProductCompletenessSource,
  field: "current_price" | "desired_price" | "cost_price"
): boolean {
  const value = getFieldValue(product, field);

  return !isMissing(value) && parsePrice(value) === null;
}

function getPriceValue(
  product: ProductCompletenessSource,
  field: "current_price" | "desired_price" | "cost_price"
): number | null {
  return parsePrice(getFieldValue(product, field));
}

function getMissingRequiredFields(
  product: ProductCompletenessSource
): ProductCompletenessIssue[] {
  return requiredFields.flatMap((field) => {
    const value = getFieldValue(product, field);
    const missing = isMissing(value) || (field === "title" && isTemporaryTitle(product));

    if (!missing) {
      return [];
    }

    return [
      createIssue(
        field,
        field === "title"
          ? "Ajouter un titre produit."
          : field === "category"
            ? "Renseigner la catégorie."
            : "Ajouter une description produit."
      )
    ];
  });
}

function getMissingRecommendedFields(
  product: ProductCompletenessSource
): ProductCompletenessIssue[] {
  return recommendedFields.flatMap((field) => {
    const value = getFieldValue(product, field);

    if (!isMissing(value)) {
      return [];
    }

    return [
      createIssue(
        field,
        field === "materials"
          ? "Renseigner la matière."
          : field === "image_url"
            ? "Ajouter une image ou un lien."
            : `Renseigner ${fieldLabels[field].toLowerCase()}.`
      )
    ];
  });
}

function getPriceBlockers(
  product: ProductCompletenessSource
): ProductCompletenessIssue[] {
  const currentPrice = getPriceValue(product, "current_price");
  const desiredPrice = getPriceValue(product, "desired_price");

  if (
    hasInvalidPriceValue(product, "current_price") ||
    hasInvalidPriceValue(product, "desired_price")
  ) {
    return [createIssue("price", "Vérifier le prix.")];
  }

  if (currentPrice === null && desiredPrice === null) {
    return [createIssue("price", "Renseigner au moins un prix.")];
  }

  return [];
}

function getWarnings(
  product: ProductCompletenessSource
): ProductCompletenessIssue[] {
  const warnings: ProductCompletenessIssue[] = [];
  const description = normalizeText(getFieldValue(product, "description"));
  const desiredPrice = getPriceValue(product, "desired_price");
  const costPrice = getPriceValue(product, "cost_price");

  if (description && description.length < 60) {
    warnings.push(
      createIssue(
        "description",
        "La description est courte ; ajoutez les informations utiles avant validation."
      )
    );
  }

  if (hasInvalidPriceValue(product, "cost_price")) {
    warnings.push(
      createIssue("cost_price", "Vérifier le coût de revient.")
    );
  }

  if (desiredPrice !== null && costPrice !== null && desiredPrice < costPrice) {
    warnings.push(
      createIssue(
        "desired_price",
        "Le prix souhaité est inférieur au coût de revient."
      )
    );
  }

  return warnings;
}

function calculateCompletenessScore(input: {
  blockers: ProductCompletenessIssue[];
  missingRecommendedFields: ProductCompletenessIssue[];
  warnings: ProductCompletenessIssue[];
}): number {
  const score =
    100 -
    input.blockers.length * 20 -
    input.missingRecommendedFields.length * 5 -
    input.warnings.length * 3;

  return Math.max(0, Math.min(100, score));
}

function getCompletenessStatus(input: {
  blockers: ProductCompletenessIssue[];
  missingRecommendedFields: ProductCompletenessIssue[];
  productStatus: ProductStatus;
  warnings: ProductCompletenessIssue[];
}): ProductCompletenessStatus {
  if (input.productStatus === "validated" && input.blockers.length === 0) {
    return "validated";
  }

  if (input.blockers.length > 0) {
    return "needs_completion";
  }

  if (input.warnings.length > 0 || input.missingRecommendedFields.length > 0) {
    return "needs_review";
  }

  return "ready_to_validate";
}

function getNextActions(input: {
  blockers: ProductCompletenessIssue[];
  missingRecommendedFields: ProductCompletenessIssue[];
  status: ProductCompletenessStatus;
  warnings: ProductCompletenessIssue[];
}): string[] {
  const actionByField: Partial<Record<ProductFieldKey | "price", string>> = {
    title: "Ajouter un titre produit.",
    category: "Renseigner la catégorie.",
    description: "Ajouter une description produit.",
    materials: "Renseigner la matière.",
    dimensions: "Renseigner les dimensions.",
    origin: "Renseigner l’origine.",
    image_url: "Ajouter une image ou un lien.",
    sku: "Ajouter un SKU si le catalogue en utilise un.",
    subtitle: "Ajouter un sous-titre si utile.",
    price: "Vérifier le prix.",
    desired_price: "Vérifier le prix souhaité.",
    cost_price: "Vérifier le coût de revient."
  };

  const issueActions = [
    ...input.blockers,
    ...input.missingRecommendedFields,
    ...input.warnings
  ]
    .map((issue) => actionByField[issue.field] ?? issue.message)
    .filter((action, index, actions) => actions.indexOf(action) === index)
    .slice(0, 5);

  if (input.status === "validated") {
    return ["La fiche dispose d’un snapshot validé pour les exports."];
  }

  if (input.blockers.length === 0) {
    return [
      ...issueActions,
      "Valider la fiche lorsque les champs essentiels sont complets."
    ].slice(0, 6);
  }

  return issueActions;
}

export function getProductCompletenessTargetId(
  target: ProductCompletenessNavigationTarget
): string {
  if (
    target === "audit" ||
    target === "validation" ||
    target === "media" ||
    target === "edition"
  ) {
    return productCompletenessSectionTargetIds[target];
  }

  if (target === "current_price" || target === "price") {
    return "field-price";
  }

  if (target === "desired_price" || target === "target_price") {
    return "field-target_price";
  }

  return `field-${target}`;
}

export function getProductCompletenessTargetHref(
  target: ProductCompletenessNavigationTarget
): string {
  return `#${getProductCompletenessTargetId(target)}`;
}

export function getProductCompletenessQuickActionTargetId(
  action: ProductCompletenessQuickAction
): string {
  if (action.targetField) {
    if (action.type !== "add_media") {
      return getProductCompletenessTargetId(action.targetField);
    }
  }

  if (action.type === "run_audit") return getProductCompletenessTargetId("audit");
  if (action.type === "validate_product") {
    return getProductCompletenessTargetId("validation");
  }
  if (action.type === "add_media") return getProductCompletenessTargetId("media");

  return action.anchor ?? getProductCompletenessTargetId("edition");
}

export function getProductCompletenessQuickActionHref(
  action: ProductCompletenessQuickAction
): string {
  return `#${getProductCompletenessQuickActionTargetId(action)}`;
}

function createFieldQuickAction(input: {
  blocking: boolean;
  description: string;
  id: string;
  label: string;
  priority: number;
  severity: ProductCompletenessQuickActionSeverity;
  targetField: ProductFieldKey;
  type: ProductCompletenessQuickActionType;
}): ProductCompletenessQuickAction {
  const anchor = getProductCompletenessTargetId(input.targetField);

  return {
    ...input,
    anchor,
    href: `#${anchor}`
  };
}

function getRequiredFieldQuickAction(
  issue: ProductCompletenessIssue
): ProductCompletenessQuickAction | null {
  if (issue.field === "title") {
    return createFieldQuickAction({
      blocking: true,
      description: "Un titre clair est nécessaire avant validation.",
      id: "add-title",
      label: "Ajouter un titre",
      priority: 10,
      severity: "blocking",
      targetField: "title",
      type: "edit_field"
    });
  }

  if (issue.field === "category") {
    return createFieldQuickAction({
      blocking: true,
      description: "La catégorie aide à vérifier les informations attendues.",
      id: "choose-category",
      label: "Choisir une catégorie",
      priority: 11,
      severity: "blocking",
      targetField: "category",
      type: "edit_field"
    });
  }

  if (issue.field === "description") {
    return createFieldQuickAction({
      blocking: true,
      description: "Une description claire est nécessaire avant validation.",
      id: "add-description",
      label: "Compléter la description",
      priority: 12,
      severity: "blocking",
      targetField: "description",
      type: "edit_field"
    });
  }

  return null;
}

function getRecommendedFieldQuickAction(
  issue: ProductCompletenessIssue
): ProductCompletenessQuickAction | null {
  if (issue.field === "materials") {
    return createFieldQuickAction({
      blocking: false,
      description: "La matière rend la fiche plus fiable et exploitable.",
      id: "add-materials",
      label: "Ajouter la matière",
      priority: 50,
      severity: "recommended",
      targetField: "materials",
      type: "edit_field"
    });
  }

  if (issue.field === "origin") {
    return createFieldQuickAction({
      blocking: false,
      description: "L’origine doit rester factuelle et vérifiée.",
      id: "add-origin",
      label: "Ajouter l’origine",
      priority: 51,
      severity: "recommended",
      targetField: "origin",
      type: "edit_field"
    });
  }

  if (issue.field === "dimensions") {
    return createFieldQuickAction({
      blocking: false,
      description: "Les dimensions facilitent la lecture produit.",
      id: "add-dimensions",
      label: "Ajouter les dimensions",
      priority: 52,
      severity: "recommended",
      targetField: "dimensions",
      type: "edit_field"
    });
  }

  if (issue.field === "sku") {
    return createFieldQuickAction({
      blocking: false,
      description: "Une référence SKU aide à retrouver la fiche.",
      id: "add-sku",
      label: "Ajouter une référence SKU",
      priority: 53,
      severity: "recommended",
      targetField: "sku",
      type: "edit_field"
    });
  }

  if (issue.field === "subtitle") {
    return createFieldQuickAction({
      blocking: false,
      description: "Le sous-titre peut clarifier le positionnement.",
      id: "add-subtitle",
      label: "Ajouter un sous-titre",
      priority: 54,
      severity: "recommended",
      targetField: "subtitle",
      type: "edit_field"
    });
  }

  if (issue.field === "image_url") {
    return createFieldQuickAction({
      blocking: false,
      description: "Une image ou un lien aide à identifier le produit.",
      id: "add-image",
      label: "Ajouter une image ou un lien",
      priority: 60,
      severity: "recommended",
      targetField: "image_url",
      type: "add_media"
    });
  }

  return null;
}

function getWarningQuickAction(
  issue: ProductCompletenessIssue
): ProductCompletenessQuickAction | null {
  if (issue.field === "description") {
    return createFieldQuickAction({
      blocking: false,
      description: "La description est courte et mérite une vérification.",
      id: "review-description",
      label: "Compléter la description",
      priority: 30,
      severity: "warning",
      targetField: "description",
      type: "review_warning"
    });
  }

  if (issue.field === "desired_price") {
    return createFieldQuickAction({
      blocking: false,
      description: "Le prix souhaité semble inférieur au coût de revient.",
      id: "review-target-price-cost",
      label: "Vérifier la cohérence prix cible / coût",
      priority: 31,
      severity: "warning",
      targetField: "desired_price",
      type: "review_warning"
    });
  }

  if (issue.field === "cost_price") {
    return createFieldQuickAction({
      blocking: false,
      description: "Le coût de revient doit être numérique s’il est renseigné.",
      id: "review-cost-price",
      label: "Vérifier le coût de revient",
      priority: 32,
      severity: "warning",
      targetField: "cost_price",
      type: "fix_value"
    });
  }

  return null;
}

function getPriceQuickAction(
  issue: ProductCompletenessIssue
): ProductCompletenessQuickAction | null {
  if (issue.field !== "price") {
    return null;
  }

  return createFieldQuickAction({
    blocking: true,
    description: "Un prix actuel ou souhaité valide est nécessaire.",
    id: "fix-price",
    label: "Corriger le prix",
    priority: 20,
    severity: "blocking",
    targetField: "current_price",
    type: "fix_value"
  });
}

function sortQuickActions(
  actions: ProductCompletenessQuickAction[]
): ProductCompletenessQuickAction[] {
  return [...actions].sort(
    (left, right) =>
      left.priority - right.priority || left.label.localeCompare(right.label)
  );
}

export function getTopProductCompletenessQuickActions(
  actions: ProductCompletenessQuickAction[],
  limit = displayQuickActionCount
): ProductCompletenessQuickAction[] {
  return sortQuickActions(actions).slice(0, limit);
}

export function getFirstProductCompletenessQuickAction(
  actions: ProductCompletenessQuickAction[],
  severity: "blocking" | "recommended"
): ProductCompletenessQuickAction | null {
  return (
    sortQuickActions(actions).find((action) => action.severity === severity) ??
    null
  );
}

export function getCatalogProductActionHref(product: {
  completeness: Pick<ProductCompletenessResult, "quickActions">;
  completenessIndicator: ProductCompletenessIndicator;
  id: string;
  status: ProductStatus;
}): string {
  let targetId = getProductCompletenessTargetId("edition");

  if (product.status === "validated") {
    targetId = getProductCompletenessTargetId("validation");
  } else if (product.completenessIndicator === "blocked") {
    const action = getFirstProductCompletenessQuickAction(
      product.completeness.quickActions,
      "blocking"
    );
    targetId = action
      ? getProductCompletenessQuickActionTargetId(action)
      : getProductCompletenessTargetId("edition");
  } else if (product.completenessIndicator === "incomplete") {
    const action = getFirstProductCompletenessQuickAction(
      product.completeness.quickActions,
      "recommended"
    );
    targetId = action
      ? getProductCompletenessQuickActionTargetId(action)
      : getProductCompletenessTargetId("edition");
  } else {
    targetId = getProductCompletenessTargetId("validation");
  }

  return `/products/${encodeURIComponent(product.id)}#${targetId}`;
}

function createQuickActions(input: {
  blockers: ProductCompletenessIssue[];
  completenessScore: number;
  missingRecommendedFields: ProductCompletenessIssue[];
  productStatus: ProductStatus;
  warnings: ProductCompletenessIssue[];
}): ProductCompletenessQuickAction[] {
  const actions = [
    ...input.blockers.flatMap((issue) => [
      getRequiredFieldQuickAction(issue),
      getPriceQuickAction(issue)
    ]),
    ...input.warnings.map(getWarningQuickAction),
    ...input.missingRecommendedFields.map(getRecommendedFieldQuickAction)
  ].filter((action): action is ProductCompletenessQuickAction =>
    Boolean(action)
  );

  if (input.productStatus === "validated" && input.blockers.length === 0) {
    const anchor = getProductCompletenessTargetId("validation");

    actions.push({
      anchor,
      blocking: false,
      completed: true,
      description: "La fiche dispose déjà d’un snapshot validé pour les exports.",
      href: `#${anchor}`,
      id: "validated-product",
      label: "Fiche validée",
      priority: 90,
      severity: "ready",
      type: "validate_product"
    });
  } else if (input.blockers.length === 0 && input.completenessScore >= 80) {
    const anchor = getProductCompletenessTargetId("validation");

    actions.push({
      anchor,
      blocking: false,
      completed: false,
      description: "Relisez la fiche, puis utilisez la validation existante.",
      href: `#${anchor}`,
      id: "validate-product",
      label: "Valider la fiche",
      priority: 80,
      severity: "ready",
      type: "validate_product"
    });
  }

  return sortQuickActions(actions);
}

export function addAuditQuickAction(
  actions: ProductCompletenessQuickAction[],
  auditStatus: "current" | "stale" | "none"
): ProductCompletenessQuickAction[] {
  if (auditStatus === "current") {
    return sortQuickActions(actions);
  }

  const anchor = getProductCompletenessTargetId("audit");

  return sortQuickActions([
    ...actions,
    {
      anchor,
      blocking: false,
      completed: false,
      description:
        auditStatus === "stale"
          ? "L’audit existe mais n’est plus à jour."
          : "L’audit déterministe aide à vérifier les points restants.",
      href: `#${anchor}`,
      id: auditStatus === "stale" ? "rerun-audit" : "run-audit",
      label: auditStatus === "stale" ? "Relancer l’audit" : "Lancer l’audit",
      priority: 70,
      severity: "ready",
      type: "run_audit"
    }
  ]);
}

export function analyzeProductCompleteness(
  product: ProductCompletenessSource
): ProductCompletenessResult {
  const missingRequiredFields = getMissingRequiredFields(product);
  const priceBlockers = getPriceBlockers(product);
  const blockers = [...missingRequiredFields, ...priceBlockers];
  const missingRecommendedFields = getMissingRecommendedFields(product);
  const warnings = getWarnings(product);
  const status = getCompletenessStatus({
    blockers,
    missingRecommendedFields,
    productStatus: product.status,
    warnings
  });
  const completenessScore = calculateCompletenessScore({
    blockers,
    missingRecommendedFields,
    warnings
  });

  return {
    blockers,
    completenessScore,
    missingRecommendedFields,
    missingRequiredFields,
    nextActions: getNextActions({
      blockers,
      missingRecommendedFields,
      status,
      warnings
    }),
    quickActions: createQuickActions({
      blockers,
      completenessScore,
      missingRecommendedFields,
      productStatus: product.status,
      warnings
    }),
    status,
    statusLabel: getProductCompletenessStatusLabel(status),
    warnings
  };
}
