import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  resolveEffectivePlanKey,
  resolveWorkspaceEntitlement
} from "../src/server/entitlements/core.ts";

const now = new Date("2026-06-19T12:00:00.000Z");

assert.deepEqual(
  resolveWorkspaceEntitlement({
    record: null,
    now,
    workspaceId: "wks_demo"
  }),
  {
    currentPeriodEnd: null,
    currentPeriodStart: null,
    effectivePlanKey: "demo",
    planKey: "demo",
    source: "system",
    status: "demo",
    workspaceId: "wks_demo"
  }
);

for (const planKey of ["starter", "studio", "pro", "business"]) {
  assert.equal(
    resolveEffectivePlanKey({
      currentPeriodEnd: "2026-07-19T12:00:00.000Z",
      now,
      planKey,
      status: "active"
    }),
    planKey
  );
}

for (const status of [
  "pending_payment",
  "overdue",
  "canceled",
  "expired",
  "suspended"
]) {
  assert.equal(
    resolveEffectivePlanKey({
      currentPeriodEnd: "2026-07-19T12:00:00.000Z",
      now,
      planKey: "business",
      status
    }),
    "demo"
  );
}

assert.equal(
  resolveEffectivePlanKey({
    currentPeriodEnd: "2026-06-18T12:00:00.000Z",
    now,
    planKey: "pro",
    status: "active"
  }),
  "demo"
);

const serviceSource = await readFile(
  "src/server/entitlements/service.ts",
  "utf8"
);
const mutationSources = await Promise.all(
  [
    "src/server/imports/service.ts",
    "src/server/products/import-products.ts",
    "src/server/spaces/service.ts",
    "src/server/products/media.ts",
    "src/server/exports/service.ts",
    "src/server/ai/product-suggestions.ts"
  ].map((file) => readFile(file, "utf8"))
);

assert.match(serviceSource, /workspaceEntitlements/);
assert.match(serviceSource, /eq\(workspaceEntitlements\.workspaceId, workspaceId\)/);
assert.equal(
  mutationSources.every((source) => source.includes("assertFeatureAllowed")),
  true
);
assert.equal(
  mutationSources.some((source) => /formData\.get\([\"']plan/.test(source)),
  false
);
assert.equal(
  [...mutationSources, serviceSource].some((source) =>
    source.includes("localStorage")
  ),
  false
);

console.log("Entitlement coverage passed.");
