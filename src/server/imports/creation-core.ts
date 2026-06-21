import { isQuotaAvailable } from "../entitlements/core.ts";
import { getFichrPlan } from "../entitlements/plans.ts";
import { getEffectiveImportRowData } from "./row-corrections-core.ts";
import { getMappedSpaceName } from "./space-mapping.ts";
import {
  ImportMappingIncompleteError,
  ImportQuotaExceededError,
  ImportRowsInvalidError
} from "./errors.ts";
import type { PlanKey } from "../../types/entitlement.ts";
import type {
  ColumnMapping,
  ImportCreationPreflight,
  ImportStatus,
  ImportMappingFieldKey,
  ProductFieldKey,
  RawImportRow
} from "../../types/import.ts";
import type {
  ProductDraftData,
  ProductStatus
} from "../../types/product.ts";

const priceFields: ProductFieldKey[] = [
  "current_price",
  "desired_price",
  "cost_price",
  "target_margin"
];

export type ImportCreationSourceRow = {
  correctedData: RawImportRow | null;
  id: string;
  rawData: RawImportRow;
  rowIndex: number;
};

export type ImportDraftCandidate = {
  draftData: ProductDraftData;
  mappedSpaceName: string | null;
  rowData: RawImportRow;
  rowId: string;
  rowIndex: number;
  status: ProductStatus;
  title: string;
};

export type ImportDraftCreationPlan = {
  candidates: ImportDraftCandidate[];
  skippedRowIds: string[];
};

export type ImportCreationQuotaEvaluation = {
  blockingMessage: string | null;
  productLimit: number;
  productRemaining: number;
  spaceLimit: number;
  spaceRemaining: number;
};

export type ImportCreationSpacePlan = {
  archivedConflictNames: string[];
  newSpaceNames: string[];
  reusedSpaceNames: string[];
};

function parsePriceValue(
  value: string | null,
  field: ProductFieldKey,
  notes: string[]
): number | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/[€\s\u00a0]/g, "")
    .replace(",", ".")
    .trim();

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    notes.push(`${field}: valeur prix conservee sans parsing (${value})`);
    return null;
  }

  return Number(normalized);
}

function createDraftData(
  rawData: RawImportRow,
  mapping: ColumnMapping
): ProductDraftData {
  const parsingNotes: string[] = [];
  const draftData: ProductDraftData = {};

  for (const [field, column] of Object.entries(mapping) as Array<
    [ImportMappingFieldKey, string]
  >) {
    if (field === "space_name") {
      continue;
    }

    const rawValue = rawData[column];

    if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
      continue;
    }

    if (priceFields.includes(field)) {
      draftData[field] =
        parsePriceValue(rawValue.trim(), field, parsingNotes) ?? rawValue.trim();
    } else {
      draftData[field] = rawValue.trim();
    }
  }

  if (parsingNotes.length > 0) {
    draftData.parsing_notes = parsingNotes;
  }

  return draftData;
}

function hasMappedDraftContent(draftData: ProductDraftData): boolean {
  return Object.entries(draftData).some(
    ([field, value]) =>
      field !== "parsing_notes" &&
      value !== null &&
      value !== undefined &&
      String(value).trim().length > 0
  );
}

function getProductStatus(draftData: ProductDraftData): ProductStatus {
  return draftData.title && draftData.description ? "draft" : "needs_info";
}

function getProductTitle(
  draftData: ProductDraftData,
  rowIndex: number
): string {
  return typeof draftData.title === "string" && draftData.title.length > 0
    ? draftData.title
    : `Produit sans titre - ligne ${rowIndex}`;
}

function getUpgradeAdvice(planKey: PlanKey): string {
  return planKey === "demo"
    ? "Passez en Studio ou réduisez le fichier pour continuer."
    : "Réduisez le fichier ou choisissez un plan avec un quota supérieur.";
}

export function assertImportMappingComplete(mapping: ColumnMapping): void {
  if (!mapping.title) {
    throw new ImportMappingIncompleteError(
      "Le mapping doit contenir au moins un nom de produit. Associez une colonne au champ Titre."
    );
  }
}

export function buildImportDraftCreationPlan(input: {
  mapping: ColumnMapping;
  rows: ImportCreationSourceRow[];
}): ImportDraftCreationPlan {
  assertImportMappingComplete(input.mapping);
  const candidates: ImportDraftCandidate[] = [];
  const skippedRowIds: string[] = [];

  for (const row of input.rows) {
    const rowData = getEffectiveImportRowData(row);
    const draftData = createDraftData(rowData, input.mapping);

    if (!hasMappedDraftContent(draftData)) {
      skippedRowIds.push(row.id);
      continue;
    }

    candidates.push({
      draftData,
      mappedSpaceName: getMappedSpaceName(rowData, input.mapping),
      rowData,
      rowId: row.id,
      rowIndex: row.rowIndex,
      status: getProductStatus(draftData),
      title: getProductTitle(draftData, row.rowIndex)
    });
  }

  return { candidates, skippedRowIds };
}

export function assertCsvImportQuota(input: {
  currentImportCount: number;
  planKey: PlanKey;
}): void {
  const plan = getFichrPlan(input.planKey);

  if (
    !isQuotaAvailable({
      currentUsage: input.currentImportCount,
      planKey: input.planKey,
      quotaKey: "maxImports"
    })
  ) {
    throw new ImportQuotaExceededError(
      `Votre plan ${plan.label} autorise ${plan.quotas.maxImports} imports. Le quota d’imports est atteint. ${getUpgradeAdvice(input.planKey)}`
    );
  }
}

export function buildImportCreationSpacePlan(input: {
  candidates: ImportDraftCandidate[];
  spaces: Array<{ archivedAt: string | null; name: string }>;
}): ImportCreationSpacePlan {
  const activeNames = new Set(
    input.spaces
      .filter((space) => !space.archivedAt)
      .map((space) => space.name)
  );
  const archivedNames = new Set(
    input.spaces
      .filter((space) => space.archivedAt)
      .map((space) => space.name)
  );
  const mappedNames = new Set(
    input.candidates.flatMap((candidate) =>
      candidate.mappedSpaceName ? [candidate.mappedSpaceName] : []
    )
  );
  const sortedNames = [...mappedNames].sort((left, right) =>
    left.localeCompare(right, "fr", { sensitivity: "base" })
  );

  return {
    archivedConflictNames: sortedNames.filter((name) =>
      archivedNames.has(name)
    ),
    newSpaceNames: sortedNames.filter(
      (name) => !activeNames.has(name) && !archivedNames.has(name)
    ),
    reusedSpaceNames: sortedNames.filter((name) => activeNames.has(name))
  };
}

export function evaluateImportCreationQuotas(input: {
  currentProductCount: number;
  currentSpaceCount: number;
  newSpaceCount: number;
  planKey: PlanKey;
  productCount: number;
}): ImportCreationQuotaEvaluation {
  const plan = getFichrPlan(input.planKey);
  const productRemaining = Math.max(
    plan.quotas.maxProducts - input.currentProductCount,
    0
  );
  const spaceRemaining = Math.max(
    plan.quotas.maxSpaces - input.currentSpaceCount,
    0
  );
  let blockingMessage: string | null = null;

  if (
    !isQuotaAvailable({
      additionalUsage: input.productCount,
      currentUsage: input.currentProductCount,
      planKey: input.planKey,
      quotaKey: "maxProducts"
    })
  ) {
    blockingMessage = `Votre plan ${plan.label} autorise ${plan.quotas.maxProducts} produits. Ce fichier contient ${input.productCount} lignes prêtes à créer, mais il reste ${productRemaining} place(s). ${getUpgradeAdvice(input.planKey)}`;
  } else if (
    input.newSpaceCount > 0 &&
    !isQuotaAvailable({
      additionalUsage: input.newSpaceCount,
      currentUsage: input.currentSpaceCount,
      planKey: input.planKey,
      quotaKey: "maxSpaces"
    })
  ) {
    blockingMessage = `Votre plan ${plan.label} autorise ${plan.quotas.maxSpaces} espaces. Ce fichier demande ${input.newSpaceCount} nouveaux espaces, mais il reste ${spaceRemaining} place(s). ${getUpgradeAdvice(input.planKey)}`;
  } else if (input.productCount === 0) {
    blockingMessage =
      "Aucune ligne produit exploitable n’est prête. Corrigez les lignes ou le mapping avant de continuer.";
  }

  return {
    blockingMessage,
    productLimit: plan.quotas.maxProducts,
    productRemaining,
    spaceLimit: plan.quotas.maxSpaces,
    spaceRemaining
  };
}

export function assertImportCreationQuotas(input: {
  currentProductCount: number;
  currentSpaceCount: number;
  newSpaceCount: number;
  planKey: PlanKey;
  productCount: number;
}): void {
  const evaluation = evaluateImportCreationQuotas(input);

  if (!evaluation.blockingMessage) {
    return;
  }

  if (input.productCount === 0) {
    throw new ImportRowsInvalidError(evaluation.blockingMessage);
  }

  throw new ImportQuotaExceededError(evaluation.blockingMessage);
}

export function buildImportCreationPreflight(input: {
  blockedRowCount: number;
  canWrite: boolean;
  existingProductRowIds: string[];
  importStatus: ImportStatus;
  importedRowCount: number;
  mapping: ColumnMapping | null;
  planKey: PlanKey;
  rows: ImportCreationSourceRow[];
  spaces: Array<{ archivedAt: string | null; name: string }>;
  usage: {
    products: number;
    spaces: number;
  };
}): ImportCreationPreflight {
  const plan = getFichrPlan(input.planKey);
  const base = {
    archivedConflictSpaceCount: 0,
    blockingMessage: null,
    canCreate: false,
    creatableRowCount: 0,
    ignoredRowCount: input.blockedRowCount,
    mappedFieldCount: input.mapping ? Object.keys(input.mapping).length : 0,
    newSpaceCount: 0,
    planKey: input.planKey,
    planLabel: plan.label,
    productQuota: {
      limit: plan.quotas.maxProducts,
      remaining: Math.max(plan.quotas.maxProducts - input.usage.products, 0),
      used: input.usage.products
    },
    productsToCreate: 0,
    reusedSpaceCount: 0,
    spaceQuota: {
      limit: plan.quotas.maxSpaces,
      remaining: Math.max(plan.quotas.maxSpaces - input.usage.spaces, 0),
      used: input.usage.spaces
    },
    titleMapped: Boolean(input.mapping?.title),
    totalRowCount:
      input.rows.length + input.blockedRowCount + input.importedRowCount
  };

  if (input.importStatus === "failed") {
    return {
      ...base,
      blockingMessage:
        "Le fichier contient une erreur bloquante. Corrigez ou réimportez le CSV.",
      status: "failed"
    };
  }

  if (input.importStatus === "processed" && input.importedRowCount > 0) {
    return {
      ...base,
      creatableRowCount: input.importedRowCount,
      ignoredRowCount: input.blockedRowCount,
      productsToCreate: 0,
      status: "already_processed"
    };
  }

  if (!input.mapping?.title) {
    return {
      ...base,
      blockingMessage:
        "Associez une colonne au champ Titre puis validez le mapping.",
      status: "mapping_required"
    };
  }

  const existingProductRowIds = new Set(input.existingProductRowIds);
  const creationPlan = buildImportDraftCreationPlan({
    mapping: input.mapping,
    rows: input.rows.filter((row) => !existingProductRowIds.has(row.id))
  });
  const spacePlan = buildImportCreationSpacePlan({
    candidates: creationPlan.candidates,
    spaces: input.spaces
  });
  const quota = evaluateImportCreationQuotas({
    currentProductCount: input.usage.products,
    currentSpaceCount: input.usage.spaces,
    newSpaceCount: spacePlan.newSpaceNames.length,
    planKey: input.planKey,
    productCount: creationPlan.candidates.length
  });
  const permissionMessage = input.canWrite
    ? null
    : "Votre rôle permet de consulter cet import, mais pas de créer des produits.";
  const blockingMessage = permissionMessage ?? quota.blockingMessage;

  return {
    ...base,
    archivedConflictSpaceCount: spacePlan.archivedConflictNames.length,
    blockingMessage,
    canCreate: !blockingMessage,
    creatableRowCount: creationPlan.candidates.length,
    ignoredRowCount:
      input.blockedRowCount +
      input.existingProductRowIds.length +
      creationPlan.skippedRowIds.length,
    newSpaceCount: spacePlan.newSpaceNames.length,
    productQuota: {
      limit: quota.productLimit,
      remaining: quota.productRemaining,
      used: input.usage.products
    },
    productsToCreate: creationPlan.candidates.length,
    reusedSpaceCount: spacePlan.reusedSpaceNames.length,
    spaceQuota: {
      limit: quota.spaceLimit,
      remaining: quota.spaceRemaining,
      used: input.usage.spaces
    },
    status: blockingMessage ? "blocked" : "ready"
  };
}
