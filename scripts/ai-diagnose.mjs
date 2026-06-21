import { existsSync, readFileSync } from "node:fs";

import { getAiUsageLimits } from "../src/server/ai/core.ts";

function parseEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .flatMap((line) => {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
          return [];
        }

        const index = trimmed.indexOf("=");
        const key = trimmed.slice(0, index).trim();
        const value = trimmed
          .slice(index + 1)
          .trim()
          .replace(/^["']|["']$/g, "");

        return key ? [[key, value]] : [];
      })
  );
}

function isEnvLocalIgnored() {
  if (!existsSync(".gitignore")) {
    return false;
  }

  const gitignore = readFileSync(".gitignore", "utf8");

  return (
    /^\.env\.local$/m.test(gitignore) ||
    /^\.env\.\*$/m.test(gitignore) ||
    /^\.env$/m.test(gitignore)
  );
}

const localEnv = parseEnvFile(".env.local");
const env = {
  ...process.env,
  ...localEnv
};
const limits = getAiUsageLimits(env);

console.log(`AI_ENABLED: ${env.AI_ENABLED ?? "false"}`);
console.log(`AI_PROVIDER: ${env.AI_PROVIDER ?? "disabled"}`);
console.log(
  `OPENAI_API_KEY: ${env.OPENAI_API_KEY?.trim() ? "present" : "missing"}`
);
console.log(`OPENAI_MODEL: ${env.OPENAI_MODEL ?? ""}`);
console.log(`AI_DAILY_SUGGESTION_LIMIT: ${limits.dailySuggestionLimit}`);
console.log(`AI_MONTHLY_SUGGESTION_LIMIT: ${limits.monthlySuggestionLimit}`);
console.log(`AI_MAX_OUTPUT_TOKENS: ${limits.maxOutputTokens}`);
console.log(`AI_REQUEST_TIMEOUT_MS: ${limits.requestTimeoutMs}`);
console.log(`.env.local ignored: ${isEnvLocalIgnored() ? "yes" : "no"}`);
console.log("Expected OpenAI permissions: List models Read, Responses Write.");
console.log("Disabled permissions: Files, Realtime, Images, Embeddings, Chat completions.");
console.log("Network test: skipped");
