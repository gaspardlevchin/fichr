import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { parseCheckoutSelection } from "../src/server/billing/core.ts";
import { createMollieBillingProvider } from "../src/server/billing/providers/mollie.ts";

assert.deepEqual(
  parseCheckoutSelection({ interval: "month", planKey: "studio" }),
  {
    amountCents: 2900,
    interval: "month",
    planKey: "studio"
  }
);
assert.throws(
  () => parseCheckoutSelection({ interval: "month", planKey: "unknown" }),
  /Plan/
);
assert.throws(
  () => parseCheckoutSelection({ interval: "week", planKey: "studio" }),
  /Période/
);
assert.throws(
  () => parseCheckoutSelection({ interval: "month", planKey: "demo" }),
  /Plan/
);

const unconfiguredProvider = createMollieBillingProvider({}, async () => {
  throw new Error("Network must not be called.");
});
assert.equal(unconfiguredProvider.isConfigured(), false);
await assert.rejects(
  () =>
    unconfiguredProvider.createCheckoutSession({
      amountCents: 2900,
      currency: "EUR",
      email: "owner@example.com",
      interval: "month",
      invoiceId: "inv_test",
      planKey: "studio",
      workspaceId: "wks_test"
    }),
  /n’est pas configurée/
);

const [
  serviceSource,
  providerIndexSource,
  mollieSource,
  schemaSource,
  actionSource
] = await Promise.all([
  readFile("src/server/billing/service.ts", "utf8"),
  readFile("src/server/billing/providers/index.ts", "utf8"),
  readFile("src/server/billing/providers/mollie.ts", "utf8"),
  readFile("db/schema.ts", "utf8"),
  readFile("src/server/billing/actions.ts", "utf8")
]);

assert.match(serviceSource, /getBillingProvider/);
assert.equal(serviceSource.includes("api.mollie.com"), false);
assert.match(providerIndexSource, /createMollieBillingProvider/);
assert.match(mollieSource, /api\.mollie\.com/);
assert.match(actionSource, /startBillingCheckout/);
assert.match(serviceSource, /requireWorkspaceAccess/);
assert.match(serviceSource, /status: "pending"/);
assert.equal(/stripe/i.test([serviceSource, schemaSource, mollieSource].join("\n")), false);
assert.equal(/card_number|credit_card|iban/i.test(schemaSource), false);
assert.equal(serviceSource.includes("localStorage"), false);

console.log("Billing provider coverage passed.");
