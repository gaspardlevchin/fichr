import assert from "node:assert/strict";

import { isQuotaAvailable } from "../src/server/entitlements/core.ts";
import { fichrPlans } from "../src/server/entitlements/plans.ts";

for (const planKey of ["demo", "starter", "studio", "pro", "business"]) {
  const plan = fichrPlans[planKey];

  for (const [quotaKey, quota] of Object.entries(plan.quotas)) {
    assert.equal(
      isQuotaAvailable({
        currentUsage: quota - 1,
        planKey,
        quotaKey
      }),
      true
    );
    assert.equal(
      isQuotaAvailable({
        currentUsage: quota,
        planKey,
        quotaKey
      }),
      false
    );
  }
}

assert.equal(
  isQuotaAvailable({
    additionalUsage: 3,
    currentUsage: fichrPlans.demo.quotas.maxProducts - 2,
    planKey: "demo",
    quotaKey: "maxProducts"
  }),
  false
);

console.log("Plan limit coverage passed.");
