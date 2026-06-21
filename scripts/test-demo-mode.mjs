import assert from "node:assert/strict";

import {
  isFeatureAllowed,
  resolveWorkspaceEntitlement
} from "../src/server/entitlements/core.ts";
import { fichrPlans } from "../src/server/entitlements/plans.ts";

const demo = resolveWorkspaceEntitlement({
  record: null,
  workspaceId: "wks_demo"
});

assert.equal(demo.effectivePlanKey, "demo");
assert.equal(isFeatureAllowed("demo", "export_pdf"), false);
assert.equal(isFeatureAllowed("demo", "ai_suggestions"), false);
assert.equal(isFeatureAllowed("demo", "export_csv"), true);
assert.equal(isFeatureAllowed("demo", "export_txt"), true);
assert.equal(isFeatureAllowed("demo", "secure_export_identity"), true);
assert.equal(fichrPlans.demo.quotas.maxProducts < fichrPlans.starter.quotas.maxProducts, true);
assert.equal(fichrPlans.demo.quotas.maxImports < fichrPlans.starter.quotas.maxImports, true);
assert.equal(fichrPlans.demo.quotas.maxSpaces < fichrPlans.starter.quotas.maxSpaces, true);
assert.equal(fichrPlans.demo.quotas.maxImages < fichrPlans.starter.quotas.maxImages, true);
assert.equal(fichrPlans.demo.quotas.maxExports < fichrPlans.starter.quotas.maxExports, true);

console.log("Demo mode coverage passed.");
