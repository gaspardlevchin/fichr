import assert from "node:assert/strict";

import {
  getAiUsageLimitErrorCode,
  getAiUsageLimits
} from "../src/server/ai/core.ts";

const defaults = getAiUsageLimits({});
assert.deepEqual(defaults, {
  dailySuggestionLimit: 20,
  maxOutputTokens: 800,
  monthlySuggestionLimit: 100,
  requestTimeoutMs: 20000
});

const configured = getAiUsageLimits({
  AI_DAILY_SUGGESTION_LIMIT: "3",
  AI_MAX_OUTPUT_TOKENS: "500",
  AI_MONTHLY_SUGGESTION_LIMIT: "10",
  AI_REQUEST_TIMEOUT_MS: "7000"
});
assert.deepEqual(configured, {
  dailySuggestionLimit: 3,
  maxOutputTokens: 500,
  monthlySuggestionLimit: 10,
  requestTimeoutMs: 7000
});

const invalid = getAiUsageLimits({
  AI_DAILY_SUGGESTION_LIMIT: "0",
  AI_MAX_OUTPUT_TOKENS: "bad",
  AI_MONTHLY_SUGGESTION_LIMIT: "-1",
  AI_REQUEST_TIMEOUT_MS: ""
});
assert.deepEqual(invalid, defaults);

assert.equal(
  getAiUsageLimitErrorCode({
    dailyCount: 20,
    limits: defaults,
    monthlyCount: 20
  }),
  "limit_reached_daily"
);
assert.equal(
  getAiUsageLimitErrorCode({
    dailyCount: 2,
    limits: configured,
    monthlyCount: 10
  }),
  "limit_reached_monthly"
);
assert.equal(
  getAiUsageLimitErrorCode({
    dailyCount: 2,
    limits: configured,
    monthlyCount: 9
  }),
  null
);

console.log("AI usage limits coverage passed.");
