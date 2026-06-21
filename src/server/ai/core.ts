import type {
  AiActionType,
  AiProtectedTechnicalFact,
  AiProductFieldSnapshot,
  ServerAiActionDefinition,
  AiStatus,
  AiSuggestionData,
  AiSuggestionDraftResult,
  AiSuggestionValidation,
  SanitizedProductForAi,
  AiTokenUsage,
  AiErrorCode,
  AiProviderDiagnostics
} from "../../types/ai";
import type { ProductFieldKey } from "../../types/import";

export type AiSanitizableProduct = {
  category?: string | null;
  clientNotes?: string | null;
  costPrice?: number | null;
  currentPrice?: number | null;
  description?: string | null;
  desiredPrice?: number | null;
  dimensions?: string | null;
  id: string;
  imageUrl?: string | null;
  materials?: string | null;
  origin?: string | null;
  sku?: string | null;
  subtitle?: string | null;
  targetMargin?: number | null;
  title?: string | null;
};

const disabledProvider = "disabled";
const openAiProvider = "openai";
const testProvider = "test";
const implementedProviders = new Set([
  disabledProvider,
  openAiProvider,
  testProvider
]);
const openAiResponsesUrl = "https://api.openai.com/v1/responses";
const defaultAiMonthlySuggestionLimit = 100;
const defaultAiDailySuggestionLimit = 20;
const defaultAiMaxOutputTokens = 800;
const defaultAiRequestTimeoutMs = 20_000;
const serverAiActionTypes: AiActionType[] = [
  "product_suggestion",
  "missing_fields_review",
  "description_rewrite",
  "pricing_consistency_review"
];
const serverProtectedTechnicalFacts: AiProtectedTechnicalFact[] = [
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
];

const editorialFields: ProductFieldKey[] = [
  "title",
  "subtitle",
  "category",
  "description",
  "client_notes"
];

const factualFields: ProductFieldKey[] = [
  "materials",
  "dimensions",
  "origin",
  "current_price",
  "desired_price",
  "cost_price",
  "target_margin",
  "sku",
  "image_url"
];
const openAiProductFields: ProductFieldKey[] = [
  "title",
  "subtitle",
  "description",
  "category",
  "sku",
  "materials",
  "origin",
  "dimensions",
  "current_price",
  "desired_price",
  "cost_price",
  "target_margin",
  "client_notes"
];
const suggestionRequiredKeys = [
  "proposed_subtitle",
  "proposed_description",
  "missing_fields",
  "possible_inconsistencies",
  "questions_to_ask",
  "confidence_score",
  "factual_warnings",
  "editorial_notes",
  "non_invention_notice"
] as const;
const stringArrayKeys = [
  "missing_fields",
  "possible_inconsistencies",
  "questions_to_ask",
  "factual_warnings",
  "editorial_notes"
] as const;
const productFieldSet = new Set<ProductFieldKey>([
  ...editorialFields,
  ...factualFields
]);

type OpenAiFetch = (
  input: string,
  init: {
    body: string;
    headers: Record<string, string>;
    method: "POST";
    signal?: AbortSignal;
  }
) => Promise<{
  json: () => Promise<unknown>;
  ok: boolean;
  status: number;
}>;

export type OpenAiSuggestionOptions = {
  env?: NodeJS.ProcessEnv;
  fetcher?: OpenAiFetch;
  timeoutMs?: number;
};

export type AiUsageLimits = {
  dailySuggestionLimit: number;
  maxOutputTokens: number;
  monthlySuggestionLimit: number;
  requestTimeoutMs: number;
};

const protectedFactFieldMap: Partial<Record<AiProtectedTechnicalFact, ProductFieldKey>> = {
  material: "materials",
  origin: "origin",
  country_of_manufacture: "origin",
  dimension: "dimensions",
  cost_price: "cost_price",
  real_margin: "target_margin",
  composition: "materials",
  market_price: "desired_price"
};

const serverAiActionDefinitions: Record<AiActionType, ServerAiActionDefinition> = {
  product_suggestion: {
    action: "product_suggestion",
    allowedOutputs: [
      "proposedSubtitle",
      "proposedDescription",
      "fieldsToAsk",
      "possibleInconsistencies",
      "confidenceRisks",
      "confidenceScore"
    ],
    instructionTemplate:
      "Prepare a controlled product sheet suggestion. Improve wording only. Mark missing factual information as a question or as a confirmer.",
    serverOnly: true
  },
  missing_fields_review: {
    action: "missing_fields_review",
    allowedOutputs: ["fieldsToAsk", "confidenceRisks", "confidenceScore"],
    instructionTemplate:
      "Review only missing fields. Never fill factual gaps. Return questions to ask the client.",
    serverOnly: true
  },
  description_rewrite: {
    action: "description_rewrite",
    allowedOutputs: [
      "proposedDescription",
      "confidenceRisks",
      "confidenceScore"
    ],
    instructionTemplate:
      "Rewrite provided editorial text without adding technical claims.",
    serverOnly: true
  },
  pricing_consistency_review: {
    action: "pricing_consistency_review",
    allowedOutputs: [
      "possibleInconsistencies",
      "fieldsToAsk",
      "confidenceRisks",
      "confidenceScore"
    ],
    instructionTemplate:
      "Review consistency between provided prices only. Never invent market price, cost price, margin, or stock.",
    serverOnly: true
  }
};

const productAccessors: Record<
  ProductFieldKey,
  (product: AiSanitizableProduct) => string | number | null | undefined
> = {
  title: (product) => product.title,
  subtitle: (product) => product.subtitle,
  category: (product) => product.category,
  description: (product) => product.description,
  materials: (product) => product.materials,
  dimensions: (product) => product.dimensions,
  origin: (product) => product.origin,
  current_price: (product) => product.currentPrice,
  desired_price: (product) => product.desiredPrice,
  cost_price: (product) => product.costPrice,
  target_margin: (product) => product.targetMargin,
  sku: (product) => product.sku,
  image_url: (product) => product.imageUrl,
  client_notes: (product) => product.clientNotes
};

function normalizeProvider(value?: string): string {
  const normalized = value?.trim().toLowerCase();

  return normalized && normalized.length > 0 ? normalized : disabledProvider;
}

function getConfiguredProvider(env: NodeJS.ProcessEnv): string {
  return normalizeProvider(env.AI_PROVIDER ?? env.FICHR_AI_PROVIDER);
}

function isAiEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.AI_ENABLED === "true";
}

function hasOpenAiKey(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.OPENAI_API_KEY?.trim());
}

function hasOpenAiModel(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.OPENAI_MODEL?.trim());
}

function normalizePositiveInteger(
  value: string | undefined,
  fallback: number
): number {
  const parsed = Number.parseInt(value ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getAiUsageLimits(
  env: NodeJS.ProcessEnv = process.env
): AiUsageLimits {
  return {
    dailySuggestionLimit: normalizePositiveInteger(
      env.AI_DAILY_SUGGESTION_LIMIT,
      defaultAiDailySuggestionLimit
    ),
    maxOutputTokens: normalizePositiveInteger(
      env.AI_MAX_OUTPUT_TOKENS,
      defaultAiMaxOutputTokens
    ),
    monthlySuggestionLimit: normalizePositiveInteger(
      env.AI_MONTHLY_SUGGESTION_LIMIT,
      defaultAiMonthlySuggestionLimit
    ),
    requestTimeoutMs: normalizePositiveInteger(
      env.AI_REQUEST_TIMEOUT_MS,
      defaultAiRequestTimeoutMs
    )
  };
}

export function getAiUsageLimitErrorCode(input: {
  dailyCount: number;
  limits: AiUsageLimits;
  monthlyCount: number;
}): AiErrorCode | null {
  if (input.dailyCount >= input.limits.dailySuggestionLimit) {
    return "limit_reached_daily";
  }

  if (input.monthlyCount >= input.limits.monthlySuggestionLimit) {
    return "limit_reached_monthly";
  }

  return null;
}

function isTestProviderEnabled(env: NodeJS.ProcessEnv): boolean {
  return (
    env.NODE_ENV === "test" &&
    getConfiguredProvider(env) === testProvider &&
    env.FICHR_AI_TEST_PROVIDER_ENABLED === "1"
  );
}

function toFieldSnapshot(
  value: string | number | null | undefined
): AiProductFieldSnapshot {
  if (typeof value === "number") {
    return { status: "provided", value };
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return { status: "provided", value: value.trim() };
  }

  return { status: "missing", value: null };
}

function isMissingFact(
  sanitizedProduct: SanitizedProductForAi,
  field: ProductFieldKey
): boolean {
  return sanitizedProduct.factual[field]?.status === "missing";
}

function isTechnicalClaimAllowed(
  sanitizedProduct: SanitizedProductForAi,
  fact: AiProtectedTechnicalFact
): boolean {
  const mappedField = protectedFactFieldMap[fact];

  return Boolean(mappedField && !isMissingFact(sanitizedProduct, mappedField));
}

function hasSuggestedValue(value: string | number | undefined): boolean {
  return typeof value === "number" || Boolean(value?.trim());
}

export function getAiStatus(env: NodeJS.ProcessEnv = process.env): AiStatus {
  const provider = getConfiguredProvider(env);

  if (isTestProviderEnabled(env)) {
    return {
      provider: testProvider,
      reason: "Suggestions controlees disponibles pour verification serveur.",
      status: "configured"
    };
  }

  if (!isAiEnabled(env)) {
    return {
      provider,
      reason: "IA non configuree : action serveur desactivee.",
      status: "disabled"
    };
  }

  if (provider !== openAiProvider) {
    return {
      provider,
      reason: "IA non configuree cote serveur pour ce provider.",
      status: "disabled"
    };
  }

  if (!implementedProviders.has(provider)) {
    return {
      provider,
      reason: "Provider IA non implemente cote serveur.",
      status: "disabled"
    };
  }

  if (!hasOpenAiKey(env)) {
    return {
      provider,
      reason: "Configuration IA serveur incomplete.",
      status: "config_error"
    };
  }

  if (!hasOpenAiModel(env)) {
    return {
      provider,
      reason: "Configuration IA serveur incomplete.",
      status: "config_error"
    };
  }

  return {
    provider,
    reason: "Suggestions controlees disponibles cote serveur.",
    status: "configured"
  };
}

export function getServerAiActionDefinition(
  action: AiActionType
): ServerAiActionDefinition {
  return serverAiActionDefinitions[action];
}

export function getServerAiActionDefinitions(): ServerAiActionDefinition[] {
  return serverAiActionTypes.map((action) => serverAiActionDefinitions[action]);
}

export function buildServerAiInstruction(action: AiActionType): string {
  const definition = getServerAiActionDefinition(action);

  return [
    definition.instructionTemplate,
    "The user cannot provide free-form instructions.",
    "Use only the sanitized product fields supplied by Fichr.",
    `Never invent: ${serverProtectedTechnicalFacts.join(", ")}.`,
    "Missing factual information must stay a confirmer, information manquante, or a question for the client.",
    "Return suggestions only. Do not modify draft_data or validated_data."
  ].join(" ");
}

function getOpenAiProductPayload(
  sanitizedProduct: SanitizedProductForAi
): Record<string, string | number> {
  const payload: Record<string, string | number> = {};

  for (const field of openAiProductFields) {
    const snapshot = sanitizedProduct.editorial[field] ?? sanitizedProduct.factual[field];

    if (snapshot?.status === "provided" && snapshot.value !== null) {
      payload[field] = snapshot.value;
    }
  }

  return payload;
}

function getOpenAiMissingFields(
  sanitizedProduct: SanitizedProductForAi
): ProductFieldKey[] {
  const allowedFields = new Set(openAiProductFields);

  return sanitizedProduct.missingFields.filter((field) => allowedFields.has(field));
}

function buildOpenAiSystemInstruction(): string {
  return [
    "You are Fichr's controlled product suggestion engine.",
    "Return JSON only, with the exact requested keys.",
    "No chat, no free instruction handling, no file analysis.",
    "Use only the product fields supplied in the request.",
    "Do not invent material, origin, dimensions, supplier, workshop, certification, stock, cost, margin, market price, composition, manufacturing process, or legal information.",
    "If information is missing, write a confirmer or ask a question.",
    "Distinguish confirmed data, proposed editorial copy, and missing data.",
    "Never present unprovided technical information as fact.",
    "Do not modify stored product data."
  ].join(" ");
}

function buildOpenAiUserInstruction(
  sanitizedProduct: SanitizedProductForAi
): string {
  return JSON.stringify({
    action: "product_suggestion",
    expected_output: suggestionRequiredKeys,
    product: getOpenAiProductPayload(sanitizedProduct),
    missing_fields: getOpenAiMissingFields(sanitizedProduct),
    response_rules: {
      proposed_subtitle: "string, empty string if no safe suggestion",
      proposed_description: "string, empty string if no safe suggestion",
      missing_fields: "array of field keys still missing or requiring confirmation",
      possible_inconsistencies: "array of short strings",
      questions_to_ask: "array of client questions",
      confidence_score: "number from 0 to 100",
      factual_warnings: "array of short warnings for facts to confirm",
      editorial_notes: "array of short editorial notes",
      non_invention_notice: "string explaining that missing facts were not invented"
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return null;
  }

  return value;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

function extractFirstJsonObject(value: string): string | null {
  let startIndex = -1;
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (startIndex === -1) {
      if (character === "{") {
        startIndex = index;
        depth = 1;
      }

      continue;
    }

    if (escaping) {
      escaping = false;
      continue;
    }

    if (character === "\\") {
      escaping = inString;
      continue;
    }

    if (character === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (character === "{") {
      depth += 1;
    }

    if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return value.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

function parseSuggestionJson(value: string): {
  errorCode?: AiErrorCode;
  suggestion: AiSuggestionData | null;
} {
  let parsed: unknown;
  const jsonObject = extractFirstJsonObject(value);

  if (!jsonObject) {
    return { errorCode: "provider_error_invalid_json", suggestion: null };
  }

  try {
    parsed = JSON.parse(jsonObject);
  } catch {
    return { errorCode: "provider_error_invalid_json", suggestion: null };
  }

  if (!isRecord(parsed)) {
    return { errorCode: "provider_error_schema", suggestion: null };
  }

  for (const key of suggestionRequiredKeys) {
    if (!(key in parsed)) {
      return { errorCode: "provider_error_schema", suggestion: null };
    }
  }

  const arrays = Object.fromEntries(
    stringArrayKeys.map((key) => [key, asStringArray(parsed[key])])
  ) as Record<(typeof stringArrayKeys)[number], string[] | null>;

  if (Object.values(arrays).some((array) => array === null)) {
    return { errorCode: "provider_error_schema", suggestion: null };
  }

  if (
    arrays.missing_fields?.some(
      (field) => !productFieldSet.has(field as ProductFieldKey)
    )
  ) {
    return { errorCode: "provider_error_schema", suggestion: null };
  }

  if (typeof parsed.confidence_score !== "number") {
    return { errorCode: "provider_error_schema", suggestion: null };
  }

  if (typeof parsed.non_invention_notice !== "string") {
    return { errorCode: "provider_error_schema", suggestion: null };
  }

  const suggestion: AiSuggestionData = {
    confidence_score: parsed.confidence_score,
    editorial_notes: arrays.editorial_notes ?? [],
    factual_warnings: arrays.factual_warnings ?? [],
    missing_fields: (arrays.missing_fields ?? []) as ProductFieldKey[],
    non_invention_notice: parsed.non_invention_notice.trim(),
    possible_inconsistencies: arrays.possible_inconsistencies ?? [],
    proposed_description: normalizeOptionalString(parsed.proposed_description),
    proposed_subtitle: normalizeOptionalString(parsed.proposed_subtitle),
    questions_to_ask: arrays.questions_to_ask ?? []
  };

  if (isRecord(parsed.factual_claims)) {
    suggestion.factual_claims = parsed.factual_claims as Partial<
      Record<ProductFieldKey, string | number>
    >;
  }

  if (isRecord(parsed.technical_claims)) {
    suggestion.technical_claims = parsed.technical_claims as Partial<
      Record<AiProtectedTechnicalFact, string | number>
    >;
  }

  return { suggestion };
}

function extractOpenAiText(response: unknown): string | null {
  if (!isRecord(response)) {
    return null;
  }

  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  if (!Array.isArray(response.output)) {
    return null;
  }

  const parts = response.output.flatMap((outputItem) => {
    if (!isRecord(outputItem) || !Array.isArray(outputItem.content)) {
      return [];
    }

    return outputItem.content.flatMap((contentItem) => {
      if (!isRecord(contentItem)) {
        return [];
      }

      if (typeof contentItem.text === "string") {
        return [contentItem.text];
      }

      return [];
    });
  });

  return parts.length > 0 ? parts.join("\n") : null;
}

function extractOpenAiUsage(response: unknown): AiTokenUsage | undefined {
  if (!isRecord(response) || !isRecord(response.usage)) {
    return undefined;
  }

  const usage = response.usage;
  const tokenUsage: AiTokenUsage = {};

  if (typeof usage.input_tokens === "number") {
    tokenUsage.inputTokens = usage.input_tokens;
  }

  if (typeof usage.output_tokens === "number") {
    tokenUsage.outputTokens = usage.output_tokens;
  }

  if (typeof usage.total_tokens === "number") {
    tokenUsage.totalTokens = usage.total_tokens;
  }

  return Object.keys(tokenUsage).length > 0 ? tokenUsage : undefined;
}

function sanitizeProviderMessage(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return value.replace(/\s+/g, " ").trim().slice(0, 180) || undefined;
}

function getOpenAiErrorDetails(response: unknown): {
  code?: string;
  message?: string;
  type?: string;
} {
  if (!isRecord(response) || !isRecord(response.error)) {
    return {};
  }

  const error = response.error;

  return {
    code: typeof error.code === "string" ? error.code : undefined,
    message: sanitizeProviderMessage(error.message),
    type: typeof error.type === "string" ? error.type : undefined
  };
}

function mapOpenAiError(input: {
  details: ReturnType<typeof getOpenAiErrorDetails>;
  httpStatus: number;
}): AiErrorCode {
  const code = input.details.code?.toLowerCase() ?? "";
  const type = input.details.type?.toLowerCase() ?? "";
  const message = input.details.message?.toLowerCase() ?? "";
  const combined = `${code} ${type} ${message}`;

  if (
    input.httpStatus === 401 ||
    combined.includes("invalid_api_key") ||
    combined.includes("authentication")
  ) {
    return "provider_error_auth";
  }

  if (
    input.httpStatus === 404 ||
    combined.includes("model_not_found") ||
    combined.includes("does not exist")
  ) {
    return "provider_error_model_not_found";
  }

  if (
    input.httpStatus === 402 ||
    combined.includes("billing") ||
    combined.includes("quota") ||
    combined.includes("insufficient_quota")
  ) {
    return "provider_error_billing";
  }

  if (
    input.httpStatus === 403 ||
    combined.includes("permission") ||
    combined.includes("not authorized") ||
    combined.includes("forbidden")
  ) {
    return "provider_error_permission";
  }

  if (input.httpStatus === 429 || combined.includes("rate_limit")) {
    return "provider_error_rate_limit";
  }

  return "failed_unknown";
}

async function createOpenAiProductSuggestion(input: {
  env: NodeJS.ProcessEnv;
  fetcher: OpenAiFetch;
  maxOutputTokens: number;
  product: AiSanitizableProduct;
  timeoutMs: number;
}): Promise<AiSuggestionDraftResult> {
  const model = input.env.OPENAI_MODEL?.trim();
  const apiKey = input.env.OPENAI_API_KEY?.trim();

  if (!apiKey || !model) {
    return {
      message: "Configuration IA incomplete",
      errorCode: !apiKey
        ? "config_error_missing_api_key"
        : "config_error_missing_model",
      provider: openAiProvider,
      status: "failed"
    };
  }

  const sanitizedProduct = sanitizeProductForAi(input.product);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await input.fetcher(openAiResponsesUrl, {
      body: JSON.stringify({
        input: [
          {
            content: buildOpenAiSystemInstruction(),
            role: "system"
          },
          {
            content: buildOpenAiUserInstruction(sanitizedProduct),
            role: "user"
          }
        ],
        max_output_tokens: input.maxOutputTokens,
        model,
        text: {
          format: {
            type: "json_object"
          }
        }
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      method: "POST",
      signal: controller.signal
    });
    const durationMs = Date.now() - startedAt;
    const responseJson = await response.json();
    const tokenUsage = extractOpenAiUsage(responseJson);
    const providerDetails = getOpenAiErrorDetails(responseJson);

    if (!response.ok) {
      const errorCode = mapOpenAiError({
        details: providerDetails,
        httpStatus: response.status
      });

      return {
        message: `OpenAI Responses request failed with status ${response.status}`,
        diagnostics: {
          durationMs,
          errorCode: providerDetails.code,
          errorType: providerDetails.type,
          httpStatus: response.status,
          serverMessage: providerDetails.message
        },
        errorCode,
        model,
        provider: openAiProvider,
        status: "failed",
        tokenUsage
      };
    }

    const responseText = extractOpenAiText(responseJson);
    const parsedSuggestion = responseText
      ? parseSuggestionJson(responseText)
      : { errorCode: "provider_error_invalid_json" as const, suggestion: null };
    const suggestion = parsedSuggestion.suggestion;

    if (!suggestion) {
      return {
        message: "OpenAI response was not valid structured JSON.",
        diagnostics: {
          durationMs
        },
        errorCode: parsedSuggestion.errorCode ?? "provider_error_schema",
        model,
        provider: openAiProvider,
        status: "failed",
        tokenUsage
      };
    }

    const validation = validateAiSuggestion(suggestion, sanitizedProduct);

    if (!validation.valid) {
      return {
        message: "OpenAI response contained unsupported factual claims.",
        diagnostics: {
          durationMs
        },
        errorCode: "provider_error_safety_rejected",
        model,
        provider: openAiProvider,
        status: "failed",
        tokenUsage
      };
    }

    return {
      diagnostics: {
        durationMs
      },
      model,
      provider: openAiProvider,
      status: "proposed",
      suggestion,
      tokenUsage,
      warnings: validation.warnings
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const isTimeout = error instanceof Error && error.name === "AbortError";

    return {
      message:
        isTimeout
          ? "OpenAI Responses request timed out."
          : "OpenAI Responses request failed.",
      diagnostics: {
        durationMs
      },
      errorCode: isTimeout
        ? "provider_error_timeout"
        : "provider_error_network",
      model,
      provider: openAiProvider,
      status: "failed"
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function sanitizeProductForAi(
  product: AiSanitizableProduct
): SanitizedProductForAi {
  const editorial = Object.fromEntries(
    editorialFields.map((field) => [
      field,
      toFieldSnapshot(productAccessors[field](product))
    ])
  ) as SanitizedProductForAi["editorial"];
  const factual = Object.fromEntries(
    factualFields.map((field) => [
      field,
      toFieldSnapshot(productAccessors[field](product))
    ])
  ) as SanitizedProductForAi["factual"];
  const missingFields = [...editorialFields, ...factualFields].filter(
    (field) =>
      (editorial[field] ?? factual[field])?.status === "missing"
  );

  return {
    doNotInvent: factualFields,
    editorial,
    factual,
    missingFields,
    productId: product.id
  };
}

export function validateAiSuggestion(
  suggestion: AiSuggestionData,
  sanitizedProduct: SanitizedProductForAi
): AiSuggestionValidation {
  const blockedReasons: string[] = [];
  const warnings: string[] = [];

  for (const field of sanitizedProduct.doNotInvent) {
    if (!sanitizedProduct.doNotInvent.includes(field)) {
      warnings.push(`${field} n est pas un champ factuel protege.`);
    }
  }

  for (const field of factualFields) {
    const suggestedFact = suggestion.factual_claims?.[field];

    if (isMissingFact(sanitizedProduct, field) && hasSuggestedValue(suggestedFact)) {
      blockedReasons.push(
        `${field} est manquant dans la fiche et ne doit pas etre invente.`
      );
    }
  }

  for (const [fact, value] of Object.entries(suggestion.technical_claims ?? {}) as Array<
    [AiProtectedTechnicalFact, string | number | undefined]
  >) {
    if (hasSuggestedValue(value) && !isTechnicalClaimAllowed(sanitizedProduct, fact)) {
      blockedReasons.push(
        `${fact} ne doit pas etre invente ni presente comme un fait.`
      );
    }
  }

  if (suggestion.confidence_score < 0 || suggestion.confidence_score > 100) {
    blockedReasons.push("Le score de confiance doit rester entre 0 et 100.");
  }

  for (const field of sanitizedProduct.missingFields) {
    if (!suggestion.missing_fields.includes(field)) {
      warnings.push(`${field} devrait rester a confirmer.`);
    }
  }

  return {
    blockedReasons,
    valid: blockedReasons.length === 0,
    warnings
  };
}

function getProvidedFieldLabel(field: ProductFieldKey): string {
  return field.replaceAll("_", " ");
}

function createQuestionForMissingField(field: ProductFieldKey): string {
  const labels: Partial<Record<ProductFieldKey, string>> = {
    materials: "Quelle est la matiere exacte du produit ?",
    dimensions: "Quelles sont les dimensions exactes du produit ?",
    origin: "Quelle est l origine ou le lieu de fabrication a confirmer ?",
    cost_price: "Quel est le cout de revient confirme ?",
    target_margin: "Quelle marge cible doit etre retenue ?",
    current_price: "Quel prix actuel doit etre affiche ?",
    desired_price: "Quel prix souhaite doit etre retenu ?",
    sku: "Quelle reference SKU doit etre utilisee ?",
    image_url: "Quel visuel doit etre associe a la fiche ?"
  };

  return labels[field] ?? `Quelle information faut-il confirmer pour ${getProvidedFieldLabel(field)} ?`;
}

function createTestProductSuggestion(
  sanitizedProduct: SanitizedProductForAi
): AiSuggestionData {
  const title = sanitizedProduct.editorial.title?.value ?? "Produit";
  const category = sanitizedProduct.editorial.category?.value;
  const materials = sanitizedProduct.factual.materials;
  const origin = sanitizedProduct.factual.origin;
  const dimensions = sanitizedProduct.factual.dimensions;
  const missingFields = sanitizedProduct.missingFields;
  const factualWarnings = missingFields
    .filter((field) => sanitizedProduct.doNotInvent.includes(field))
    .map((field) => `${getProvidedFieldLabel(field)} : a confirmer`);
  const proposedDescriptionParts = [
    `${title}.`,
    category ? `Categorie : ${category}.` : "Categorie a confirmer.",
    materials?.status === "provided"
      ? `Matiere : ${materials.value}.`
      : "Matiere a confirmer.",
    origin?.status === "provided"
      ? `Origine : ${origin.value}.`
      : "Origine a confirmer.",
    dimensions?.status === "provided"
      ? `Dimensions : ${dimensions.value}.`
      : "Dimensions a renseigner."
  ];

  return {
    confidence_score: missingFields.length > 0 ? 48 : 72,
    editorial_notes: [
      "Suggestion test serveur structuree sans appel a un provider reel.",
      "Aucune modification automatique de la fiche produit."
    ],
    factual_warnings: factualWarnings,
    missing_fields: missingFields,
    non_invention_notice:
      "Les faits techniques absents restent a confirmer et ne sont pas inventes.",
    possible_inconsistencies: [],
    proposed_description: proposedDescriptionParts.join(" "),
    proposed_subtitle: category
      ? `${category} - informations techniques a confirmer si absentes`
      : "Informations produit a confirmer",
    questions_to_ask: missingFields.map(createQuestionForMissingField)
  };
}

export async function createProductSuggestionDraft(input: {
  aiStatus?: AiStatus;
  env?: NodeJS.ProcessEnv;
  fetcher?: OpenAiFetch;
  product: AiSanitizableProduct;
  timeoutMs?: number;
}): Promise<AiSuggestionDraftResult> {
  const env = input.env ?? process.env;
  const aiStatus = input.aiStatus ?? getAiStatus(env);

  if (aiStatus.status === "disabled") {
    return {
      errorCode: "disabled",
      message: "IA non configuree",
      provider: aiStatus.provider,
      status: "disabled"
    };
  }

  if (aiStatus.status === "config_error") {
    const errorCode: AiErrorCode = hasOpenAiKey(env)
      ? "config_error_missing_model"
      : "config_error_missing_api_key";

    return {
      errorCode,
      message: aiStatus.reason,
      provider: aiStatus.provider,
      status: "failed"
    };
  }

  if (aiStatus.provider === testProvider) {
    const sanitizedProduct = sanitizeProductForAi(input.product);
    const suggestion = createTestProductSuggestion(sanitizedProduct);
    const validation = validateAiSuggestion(suggestion, sanitizedProduct);

    if (!validation.valid) {
      return {
        errorCode: "provider_error_safety_rejected",
        message: "IA non configuree",
        provider: aiStatus.provider,
        status: "disabled"
      };
    }

    return {
      errorCode: undefined,
      provider: aiStatus.provider,
      suggestion,
      warnings: validation.warnings,
      status: "proposed"
    };
  }

  if (aiStatus.provider === openAiProvider) {
    const limits = getAiUsageLimits(env);

    return createOpenAiProductSuggestion({
      env,
      fetcher: input.fetcher ?? fetch,
      maxOutputTokens: limits.maxOutputTokens,
      product: input.product,
      timeoutMs: input.timeoutMs ?? limits.requestTimeoutMs
    });
  }

  return {
    errorCode: "disabled",
    message: "IA non configuree",
    provider: aiStatus.provider,
    status: "disabled"
  };
}

export function createAiUsageLogMetadata(input: {
  diagnostics?: AiProviderDiagnostics;
  errorCode?: AiErrorCode | null;
  model?: string | null;
  missingFieldCount: number;
  productId: string;
  suggestionId?: string | null;
  status: string;
  tokenUsage?: AiTokenUsage;
}) {
  return {
    product_id: input.productId,
    missing_field_count: input.missingFieldCount,
    duration_ms: input.diagnostics?.durationMs ?? null,
    error_code: input.errorCode ?? null,
    http_status: input.diagnostics?.httpStatus ?? null,
    model: input.model ?? null,
    provider_error_code: input.diagnostics?.errorCode ?? null,
    provider_error_type: input.diagnostics?.errorType ?? null,
    provider_message: input.diagnostics?.serverMessage ?? null,
    suggestion_id: input.suggestionId ?? null,
    status: input.status,
    input_tokens: input.tokenUsage?.inputTokens ?? null,
    output_tokens: input.tokenUsage?.outputTokens ?? null,
    total_tokens: input.tokenUsage?.totalTokens ?? null
  };
}
