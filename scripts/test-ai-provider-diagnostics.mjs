import assert from "node:assert/strict";

import {
  createProductSuggestionDraft,
  getAiStatus
} from "../src/server/ai/core.ts";

const secretApiKey = "SECRET_KEY_MUST_NOT_LEAK";
const baseEnv = {
  AI_ENABLED: "true",
  AI_PROVIDER: "openai",
  AI_MAX_OUTPUT_TOKENS: "500",
  AI_REQUEST_TIMEOUT_MS: "1000",
  OPENAI_API_KEY: secretApiKey,
  OPENAI_MODEL: "gpt-test"
};
const product = {
  id: "prd_ai_diagnostics",
  title: "Lampe diagnostic",
  desiredPrice: 120
};

function createProviderErrorFetch(httpStatus, error) {
  return async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(init.body.includes(secretApiKey), false);
    assert.equal(init.body.includes("raw_data"), false);
    assert.equal(init.body.includes("draft_data"), false);
    assert.equal(init.body.includes("validated_data"), false);
    assert.equal(JSON.parse(init.body).max_output_tokens, 500);

    return {
      ok: false,
      status: httpStatus,
      async json() {
        return { error };
      }
    };
  };
}

function createProviderSuccessFetch(outputText) {
  return async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        output_text: outputText,
        usage: {
          input_tokens: 10,
          output_tokens: 20,
          total_tokens: 30
        }
      };
    }
  });
}

async function expectFailed(fetcher, expectedCode) {
  const result = await createProductSuggestionDraft({
    env: baseEnv,
    fetcher,
    product
  });

  assert.equal(result.status, "failed");
  assert.equal(result.errorCode, expectedCode);
  assert.equal("suggestion" in result, false);
  assert.equal(JSON.stringify(result).includes(secretApiKey), false);
}

const missingKey = await createProductSuggestionDraft({
  env: {
    AI_ENABLED: "true",
    AI_PROVIDER: "openai",
    OPENAI_MODEL: "gpt-test"
  },
  product
});
assert.equal(missingKey.status, "failed");
assert.equal(missingKey.errorCode, "config_error_missing_api_key");

const missingModel = await createProductSuggestionDraft({
  env: {
    AI_ENABLED: "true",
    AI_PROVIDER: "openai",
    OPENAI_API_KEY: secretApiKey
  },
  product
});
assert.equal(missingModel.status, "failed");
assert.equal(missingModel.errorCode, "config_error_missing_model");

await expectFailed(
  createProviderErrorFetch(401, {
    code: "invalid_api_key",
    message: "Invalid API key",
    type: "authentication_error"
  }),
  "provider_error_auth"
);
await expectFailed(
  createProviderErrorFetch(404, {
    code: "model_not_found",
    message: "Model does not exist",
    type: "invalid_request_error"
  }),
  "provider_error_model_not_found"
);
await expectFailed(
  createProviderErrorFetch(429, {
    code: "insufficient_quota",
    message: "Billing quota exceeded",
    type: "billing_error"
  }),
  "provider_error_billing"
);
await expectFailed(
  createProviderErrorFetch(403, {
    code: "permission_denied",
    message: "Responses permission missing",
    type: "permission_error"
  }),
  "provider_error_permission"
);
await expectFailed(
  createProviderErrorFetch(429, {
    code: "rate_limit_exceeded",
    message: "Too many requests",
    type: "rate_limit_error"
  }),
  "provider_error_rate_limit"
);
await expectFailed(async () => {
  throw new Error("network unavailable");
}, "provider_error_network");
await expectFailed(async () => {
  const error = new Error("aborted");
  error.name = "AbortError";
  throw error;
}, "provider_error_timeout");
await expectFailed(
  createProviderSuccessFetch("not json"),
  "provider_error_invalid_json"
);
await expectFailed(
  createProviderSuccessFetch(
    JSON.stringify({
      proposed_description: "Incomplete JSON"
    })
  ),
  "provider_error_schema"
);
await expectFailed(
  createProviderSuccessFetch(
    JSON.stringify({
      proposed_subtitle: "",
      proposed_description: "Lampe en laiton massif.",
      missing_fields: ["materials"],
      possible_inconsistencies: [],
      questions_to_ask: [],
      confidence_score: 70,
      factual_warnings: [],
      editorial_notes: [],
      non_invention_notice: "Ne pas inventer.",
      factual_claims: {
        materials: "laiton massif"
      }
    })
  ),
  "provider_error_safety_rejected"
);

const success = await createProductSuggestionDraft({
  env: baseEnv,
  fetcher: createProviderSuccessFetch(
    `Before JSON ${JSON.stringify({
      proposed_subtitle: "Piece a confirmer",
      proposed_description: "Lampe diagnostic. Matiere a confirmer.",
      missing_fields: ["materials"],
      possible_inconsistencies: [],
      questions_to_ask: ["Quelle est la matiere exacte ?"],
      confidence_score: 60,
      factual_warnings: ["Matiere a confirmer."],
      editorial_notes: ["Texte propose sous supervision."],
      non_invention_notice: "Les faits absents ne sont pas inventes."
    })} after JSON`
  ),
  product
});
assert.equal(success.status, "proposed");
assert.equal(success.provider, "openai");
assert.equal(success.tokenUsage?.totalTokens, 30);

assert.equal(getAiStatus(baseEnv).status, "configured");

console.log("AI provider diagnostics coverage passed.");
