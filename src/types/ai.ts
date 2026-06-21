import type { ProductFieldKey } from "@/types/import";

export const aiSuggestionStatuses = [
  "proposed",
  "dismissed",
  "failed"
] as const;
export const aiActionTypes = [
  "product_suggestion",
  "missing_fields_review",
  "description_rewrite",
  "pricing_consistency_review"
] as const;
export const aiSuggestionTypes = aiActionTypes;
export const aiUsageStatuses = ["disabled", "complete", "failed"] as const;
export const aiErrorCodes = [
  "disabled",
  "config_error_missing_api_key",
  "config_error_missing_model",
  "provider_error_auth",
  "provider_error_model_not_found",
  "provider_error_billing",
  "provider_error_permission",
  "provider_error_rate_limit",
  "provider_error_network",
  "provider_error_timeout",
  "provider_error_invalid_json",
  "provider_error_schema",
  "provider_error_safety_rejected",
  "limit_reached_daily",
  "limit_reached_monthly",
  "failed_unknown"
] as const;
export const aiProtectedTechnicalFacts = [
  "material",
  "origin",
  "country_of_manufacture",
  "workshop",
  "supplier",
  "certification",
  "dimension",
  "weight",
  "stock",
  "cost_price",
  "real_margin",
  "market_price",
  "composition",
  "manufacturing_process",
  "legal_or_regulatory"
] as const;

export type AiActionType = (typeof aiActionTypes)[number];
export type AiProtectedTechnicalFact = (typeof aiProtectedTechnicalFacts)[number];
export type AiSuggestionStatus = (typeof aiSuggestionStatuses)[number];
export type AiSuggestionType = (typeof aiSuggestionTypes)[number];
export type AiUsageStatus = (typeof aiUsageStatuses)[number];
export type AiErrorCode = (typeof aiErrorCodes)[number];
export type AiStatusState = "configured" | "config_error" | "disabled";

export type AiStatus = {
  provider: string;
  reason: string;
  status: AiStatusState;
};

export type AiProductFieldSnapshot = {
  status: "provided" | "missing";
  value: string | number | null;
};

export type SanitizedProductForAi = {
  doNotInvent: ProductFieldKey[];
  editorial: Partial<Record<ProductFieldKey, AiProductFieldSnapshot>>;
  factual: Partial<Record<ProductFieldKey, AiProductFieldSnapshot>>;
  missingFields: ProductFieldKey[];
  productId: string;
};

export type AiSuggestionData = {
  confidence_score: number;
  editorial_notes: string[];
  factual_claims?: Partial<Record<ProductFieldKey, string | number>>;
  factual_warnings: string[];
  missing_fields: ProductFieldKey[];
  non_invention_notice: string;
  possible_inconsistencies: string[];
  proposed_description?: string;
  proposed_subtitle?: string;
  questions_to_ask: string[];
  technical_claims?: Partial<Record<AiProtectedTechnicalFact, string | number>>;
};

export type AiSuggestionValidation = {
  blockedReasons: string[];
  valid: boolean;
  warnings: string[];
};

export type AiSuggestionDraftResult =
  | {
      errorCode: AiErrorCode;
      message: string;
      provider: string;
      status: "disabled";
    }
  | {
      diagnostics?: AiProviderDiagnostics;
      errorCode: AiErrorCode;
      message: string;
      model?: string;
      provider: string;
      status: "failed";
      tokenUsage?: AiTokenUsage;
    }
  | {
      diagnostics?: AiProviderDiagnostics;
      errorCode?: AiErrorCode;
      model?: string;
      provider: string;
      suggestion: AiSuggestionData;
      warnings: string[];
      status: "proposed";
      tokenUsage?: AiTokenUsage;
    };

export type AiTokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type AiProviderDiagnostics = {
  durationMs?: number;
  errorCode?: string;
  errorType?: string;
  httpStatus?: number;
  serverMessage?: string;
};

export type ProductAiSuggestion = {
  createdAt: string;
  id: string;
  status: AiSuggestionStatus;
  suggestionData: AiSuggestionData;
  type: AiSuggestionType;
  warnings: string[];
};

export type ServerAiActionDefinition = {
  action: AiActionType;
  allowedOutputs: string[];
  instructionTemplate: string;
  serverOnly: true;
};

export type AiUsageLogMetadata = Record<string, string | number | boolean | null>;
