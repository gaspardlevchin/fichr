import { createHash } from "node:crypto";

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import {
  aiSuggestions,
  aiUsageLogs,
  productAudits,
  products
} from "../../../db/schema";
import { requireWorkspaceAccess } from "../auth/workspace";
import { db } from "../db/client";
import { assertFeatureAllowed } from "../entitlements/service";
import { createServerId } from "../ids";
import {
  createAiUsageLogMetadata,
  createProductSuggestionDraft as createProductSuggestionDraftCore,
  getAiStatus,
  getAiUsageLimitErrorCode,
  getAiUsageLimits,
  sanitizeProductForAi,
  validateAiSuggestion
} from "./core";
import type {
  AiSuggestionStatus,
  AiSuggestionDraftResult,
  ProductAiSuggestion,
  AiErrorCode
} from "../../types/ai";
import type { ProductDraftData, ProductStatus } from "../../types/product";

const aiWriteRoles = ["owner", "admin", "editor"] as const;
const applicableSuggestionFields = new Set(["subtitle", "description"]);

type ApplicableSuggestionField = "subtitle" | "description";

type DismissAiSuggestionResult =
  | {
      productId: string;
      status: "dismissed";
      suggestionId: string;
    }
  | {
      previousStatus: AiSuggestionStatus;
      productId: string;
      status: "not_active";
      suggestionId: string;
    };

type ApplyAiSuggestionFieldResult = {
  fieldKey: ApplicableSuggestionField;
  newProductStatus: ProductStatus;
  previousProductStatus: ProductStatus;
  productId: string;
  status: "applied" | "unchanged";
  suggestionId: string;
};

function getProductForAi(productId: string, workspaceId: string) {
  return db
    .select({
      category: products.category,
      clientNotes: products.clientNotes,
      costPrice: products.costPrice,
      currentPrice: products.currentPrice,
      description: products.description,
      desiredPrice: products.desiredPrice,
      dimensions: products.dimensions,
      id: products.id,
      imageUrl: products.imageUrl,
      materials: products.materials,
      origin: products.origin,
      sku: products.sku,
      subtitle: products.subtitle,
      targetMargin: products.targetMargin,
      title: products.title,
      draftData: products.draftData,
      status: products.status
    })
    .from(products)
    .where(
      and(
        eq(products.id, productId),
        eq(products.workspaceId, workspaceId),
        isNull(products.deletedAt)
      )
    )
    .limit(1)
    .get();
}

function createInputHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isApplicableSuggestionField(
  fieldKey: string
): fieldKey is ApplicableSuggestionField {
  return applicableSuggestionFields.has(fieldKey);
}

function getSuggestionFieldValue(
  suggestion: ProductAiSuggestion["suggestionData"],
  fieldKey: ApplicableSuggestionField
): string | undefined {
  if (fieldKey === "subtitle") {
    return suggestion.proposed_subtitle;
  }

  return suggestion.proposed_description;
}

function getDraftText(
  draftData: ProductDraftData,
  fieldKey: "title" | "description",
  fallback: string | null
): string {
  const value = draftData[fieldKey];

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return fallback?.trim() ?? "";
}

function getProductStatusAfterDraftChange(input: {
  currentStatus: ProductStatus;
  draftData: ProductDraftData;
  fallbackDescription: string | null;
  fallbackTitle: string | null;
}): ProductStatus {
  if (input.currentStatus === "validated") {
    return "needs_review";
  }

  const hasTitle =
    getDraftText(input.draftData, "title", input.fallbackTitle).length > 0;
  const hasDescription =
    getDraftText(
      input.draftData,
      "description",
      input.fallbackDescription
    ).length > 0;

  return hasTitle && hasDescription ? "draft" : "needs_info";
}

function countOpenAiSuggestionAttempts(input: {
  period: "day" | "month";
  workspaceId: string;
}): number {
  const now = new Date();
  const periodStart =
    input.period === "day"
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rows = db
    .select({
      createdAt: aiUsageLogs.createdAt,
      metadata: aiUsageLogs.metadata,
      status: aiUsageLogs.status
    })
    .from(aiUsageLogs)
    .where(
      and(
        eq(aiUsageLogs.workspaceId, input.workspaceId),
        eq(aiUsageLogs.provider, "openai"),
        eq(aiUsageLogs.action, "product_suggestion")
      )
    )
    .all();

  return rows.filter((row) => {
    const createdAt = new Date(`${row.createdAt.replace(" ", "T")}Z`);

    if (createdAt < periodStart) {
      return false;
    }

    if (row.status === "complete") {
      return true;
    }

    if (row.status !== "failed") {
      return false;
    }

    const errorCode =
      typeof row.metadata === "object" &&
      row.metadata !== null &&
      "error_code" in row.metadata
        ? String(row.metadata.error_code)
        : null;

    return (
      errorCode === "failed_unknown" ||
      Boolean(errorCode?.startsWith("provider_error_"))
    );
  }).length;
}

function getLimitResult(errorCode: AiErrorCode): AiSuggestionDraftResult {
  return {
    errorCode,
    message:
      errorCode === "limit_reached_daily"
        ? "Limite IA quotidienne atteinte"
        : "Limite IA mensuelle atteinte",
    provider: "openai",
    status: "failed"
  };
}

export async function createProductSuggestionDraft(
  productId: string
): Promise<AiSuggestionDraftResult> {
  const access = await requireWorkspaceAccess(aiWriteRoles);
  assertFeatureAllowed(access.workspaceId, "ai_suggestions");
  const product = getProductForAi(productId, access.workspaceId);

  if (!product) {
    throw new Error("Product not found for this workspace.");
  }

  const aiStatus = getAiStatus();
  const limits = getAiUsageLimits();

  if (aiStatus.status === "configured" && aiStatus.provider === "openai") {
    const dailyCount = countOpenAiSuggestionAttempts({
      period: "day",
      workspaceId: access.workspaceId
    });

    if (dailyCount >= limits.dailySuggestionLimit) {
      return getLimitResult("limit_reached_daily");
    }

    const monthlyCount = countOpenAiSuggestionAttempts({
      period: "month",
      workspaceId: access.workspaceId
    });
    const limitErrorCode = getAiUsageLimitErrorCode({
      dailyCount,
      limits,
      monthlyCount
    });

    if (limitErrorCode) {
      return getLimitResult(limitErrorCode);
    }
  }

  const result = await createProductSuggestionDraftCore({
    aiStatus,
    product
  });
  const sanitizedProduct = sanitizeProductForAi(product);
  let suggestionId: string | null = null;

  if (result.status === "proposed") {
    suggestionId = createServerId("ais");

    db.insert(aiSuggestions)
      .values({
        id: suggestionId,
        workspaceId: access.workspaceId,
        productId,
        type: "product_suggestion",
        status: "proposed",
        inputHash: createInputHash(sanitizedProduct),
        suggestionData: result.suggestion,
        warnings: result.warnings
      })
      .run();
  }

  if (
    result.status === "failed" &&
    (result.errorCode === "limit_reached_daily" ||
      result.errorCode === "limit_reached_monthly")
  ) {
    return result;
  }

  db.insert(aiUsageLogs)
    .values({
      id: createServerId("aiu"),
      workspaceId: access.workspaceId,
      provider: aiStatus.provider,
      action: "product_suggestion",
      status:
        result.status === "disabled"
          ? "disabled"
          : result.status === "failed"
            ? "failed"
            : "complete",
      metadata: createAiUsageLogMetadata({
        diagnostics: "diagnostics" in result ? result.diagnostics : undefined,
        errorCode: "errorCode" in result ? result.errorCode : null,
        model: "model" in result ? result.model : null,
        productId,
        missingFieldCount: sanitizedProduct.missingFields.length,
        suggestionId,
        status: result.status,
        tokenUsage: "tokenUsage" in result ? result.tokenUsage : undefined
      })
    })
    .run();

  return result;
}

export async function listProductAiSuggestions(
  productId: string
): Promise<ProductAiSuggestion[]> {
  const access = await requireWorkspaceAccess(aiWriteRoles);
  const product = getProductForAi(productId, access.workspaceId);

  if (!product) {
    throw new Error("Product not found for this workspace.");
  }

  return db
    .select({
      createdAt: aiSuggestions.createdAt,
      id: aiSuggestions.id,
      status: aiSuggestions.status,
      suggestionData: aiSuggestions.suggestionData,
      type: aiSuggestions.type,
      warnings: aiSuggestions.warnings
    })
    .from(aiSuggestions)
    .where(
      and(
        eq(aiSuggestions.productId, productId),
        eq(aiSuggestions.workspaceId, access.workspaceId)
      )
    )
    .orderBy(desc(aiSuggestions.createdAt))
    .limit(5)
    .all();
}

export async function dismissProductAiSuggestion(
  suggestionId: string
): Promise<DismissAiSuggestionResult> {
  const access = await requireWorkspaceAccess(aiWriteRoles);
  const suggestion = db
    .select({
      id: aiSuggestions.id,
      productId: aiSuggestions.productId,
      status: aiSuggestions.status
    })
    .from(aiSuggestions)
    .where(
      and(
        eq(aiSuggestions.id, suggestionId),
        eq(aiSuggestions.workspaceId, access.workspaceId)
      )
    )
    .limit(1)
    .get();

  if (!suggestion) {
    throw new Error("Suggestion not found for this workspace.");
  }

  if (!suggestion.productId) {
    throw new Error("Suggestion is not linked to a product.");
  }

  const product = getProductForAi(suggestion.productId, access.workspaceId);

  if (!product) {
    throw new Error("Product not found for this workspace.");
  }

  if (suggestion.status !== "proposed") {
    return {
      previousStatus: suggestion.status,
      productId: suggestion.productId,
      status: "not_active",
      suggestionId
    };
  }

  db.transaction((tx) => {
    const updateResult = tx.update(aiSuggestions)
      .set({
        status: "dismissed",
        updatedAt: sql`CURRENT_TIMESTAMP`
      })
      .where(
        and(
          eq(aiSuggestions.id, suggestionId),
          eq(aiSuggestions.workspaceId, access.workspaceId),
          eq(aiSuggestions.status, "proposed")
        )
      )
      .run();

    if (updateResult.changes !== 1) {
      throw new Error("Suggestion is not active.");
    }

    tx.insert(aiUsageLogs)
      .values({
        id: createServerId("aiu"),
        workspaceId: access.workspaceId,
        provider: getAiStatus().provider,
        action: "dismiss_suggestion",
        status: "complete",
        metadata: {
          suggestion_id: suggestionId,
          product_id: suggestion.productId,
          previous_status: "proposed",
          new_status: "dismissed"
        }
      })
      .run();
  });

  return {
    productId: suggestion.productId,
    status: "dismissed",
    suggestionId
  };
}

export async function applyProductAiSuggestionField(input: {
  fieldKey: string;
  suggestionId: string;
}): Promise<ApplyAiSuggestionFieldResult> {
  const access = await requireWorkspaceAccess(aiWriteRoles);

  if (!isApplicableSuggestionField(input.fieldKey)) {
    throw new Error("Suggestion field is not applicable.");
  }

  const suggestion = db
    .select({
      id: aiSuggestions.id,
      productId: aiSuggestions.productId,
      status: aiSuggestions.status,
      suggestionData: aiSuggestions.suggestionData
    })
    .from(aiSuggestions)
    .where(
      and(
        eq(aiSuggestions.id, input.suggestionId),
        eq(aiSuggestions.workspaceId, access.workspaceId)
      )
    )
    .limit(1)
    .get();

  if (!suggestion) {
    throw new Error("Suggestion not found for this workspace.");
  }

  if (!suggestion.productId) {
    throw new Error("Suggestion is not linked to a product.");
  }

  const productId = suggestion.productId;

  if (suggestion.status !== "proposed") {
    throw new Error("Only proposed suggestions can be applied.");
  }

  const product = getProductForAi(productId, access.workspaceId);

  if (!product) {
    throw new Error("Product not found for this workspace.");
  }

  const validation = validateAiSuggestion(
    suggestion.suggestionData,
    sanitizeProductForAi(product)
  );

  if (!validation.valid) {
    throw new Error("Suggestion contains unsafe factual claims.");
  }

  const suggestedValue = getSuggestionFieldValue(
    suggestion.suggestionData,
    input.fieldKey
  )?.trim();

  if (!suggestedValue) {
    throw new Error("Suggestion field is empty.");
  }

  const currentValue = product.draftData[input.fieldKey];
  const nextDraftData: ProductDraftData = {
    ...product.draftData,
    [input.fieldKey]: suggestedValue
  };
  const newProductStatus = getProductStatusAfterDraftChange({
    currentStatus: product.status,
    draftData: nextDraftData,
    fallbackDescription:
      input.fieldKey === "description" ? suggestedValue : product.description,
    fallbackTitle: product.title
  });
  const status: ApplyAiSuggestionFieldResult["status"] =
    typeof currentValue === "string" && currentValue.trim() === suggestedValue
      ? "unchanged"
      : "applied";

  if (status === "applied") {
    db.transaction((tx) => {
      tx.update(products)
        .set({
          subtitle:
            input.fieldKey === "subtitle" ? suggestedValue : product.subtitle,
          description:
            input.fieldKey === "description"
              ? suggestedValue
              : product.description,
          status: newProductStatus,
          draftData: nextDraftData,
          updatedAt: sql`CURRENT_TIMESTAMP`
        })
        .where(
          and(
            eq(products.id, productId),
            eq(products.workspaceId, access.workspaceId),
            isNull(products.deletedAt)
          )
        )
        .run();

      tx.update(productAudits)
        .set({
          status: "stale",
          updatedAt: sql`CURRENT_TIMESTAMP`
        })
        .where(
          and(
            eq(productAudits.productId, productId),
            eq(productAudits.workspaceId, access.workspaceId),
            eq(productAudits.status, "current")
          )
        )
        .run();
    });
  }

  db.insert(aiUsageLogs)
    .values({
      id: createServerId("aiu"),
      workspaceId: access.workspaceId,
      provider: getAiStatus().provider,
      action: "apply_suggestion_field",
      status: "complete",
      metadata: {
        product_id: productId,
        suggestion_id: input.suggestionId,
        field_key: input.fieldKey,
        previous_product_status: product.status,
        new_product_status: status === "applied" ? newProductStatus : product.status,
        status
      }
    })
    .run();

  return {
    fieldKey: input.fieldKey,
    newProductStatus: status === "applied" ? newProductStatus : product.status,
    previousProductStatus: product.status,
    productId,
    status,
    suggestionId: input.suggestionId
  };
}
