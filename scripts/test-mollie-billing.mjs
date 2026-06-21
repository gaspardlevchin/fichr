import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  createBillingEventHash,
  createBillingPayloadHash,
  getBillingPeriod,
  getWebhookPaymentDecision,
  mapPaymentStatus
} from "../src/server/billing/core.ts";
import { createMollieBillingProvider } from "../src/server/billing/providers/mollie.ts";

const requests = [];
const mockFetch = async (url, init = {}) => {
  requests.push({ init, url: String(url) });

  if (init.method === "POST") {
    return new Response(
      JSON.stringify({
        id: "tr_test_paid",
        status: "open",
        _links: { checkout: { href: "https://checkout.example.test/pay" } }
      }),
      { status: 201, headers: { "content-type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ id: "tr_test_paid", status: "paid" }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
};
const provider = createMollieBillingProvider(
  {
    apiKey: "test_key_not_real",
    appUrl: "http://localhost:3000",
    profileId: "pfl_test",
    returnUrl: "http://localhost:3000/account",
    webhookSecret: "test-webhook-secret"
  },
  mockFetch
);

assert.equal(provider.isConfigured(), true);
const checkout = await provider.createCheckoutSession({
  amountCents: 2900,
  currency: "EUR",
  email: "owner@example.com",
  interval: "month",
  invoiceId: "inv_test",
  planKey: "studio",
  workspaceId: "wks_test"
});
assert.equal(checkout.providerPaymentId, "tr_test_paid");
assert.equal(checkout.checkoutUrl, "https://checkout.example.test/pay");
assert.equal(checkout.status, "pending");
assert.equal(requests[0].url, "https://api.mollie.com/v2/payments");
const checkoutPayload = JSON.parse(requests[0].init.body);
assert.equal(checkoutPayload.metadata.plan_key, "studio");
assert.equal(checkoutPayload.metadata.workspace_id, "wks_test");
assert.equal(
  checkoutPayload.webhookUrl.includes("test-webhook-secret"),
  true
);

const payment = await provider.getPaymentStatus("tr_test_paid");
assert.deepEqual(payment, { id: "tr_test_paid", status: "paid" });
assert.deepEqual(
  provider.parseWebhook("id=tr_test_paid", "application/x-www-form-urlencoded"),
  {
    providerEventId: "tr_test_paid",
    providerObjectId: "tr_test_paid"
  }
);

assert.deepEqual(mapPaymentStatus("paid"), {
  entitlementStatus: "active",
  invoiceStatus: "paid",
  subscriptionStatus: "active"
});
assert.equal(mapPaymentStatus("failed").entitlementStatus, null);
assert.equal(mapPaymentStatus("canceled").entitlementStatus, null);
assert.equal(mapPaymentStatus("pending").entitlementStatus, null);
assert.equal(
  getWebhookPaymentDecision({
    currentInvoiceStatus: "pending",
    paymentStatus: "paid"
  }),
  "activate"
);
assert.equal(
  getWebhookPaymentDecision({
    currentInvoiceStatus: "paid",
    paymentStatus: "paid"
  }),
  "ignore"
);
const period = getBillingPeriod({
  interval: "month",
  start: new Date("2026-06-19T12:00:00.000Z")
});
assert.equal(period.start, "2026-06-19T12:00:00.000Z");
assert.equal(period.end, "2026-07-19T12:00:00.000Z");
assert.equal(createBillingPayloadHash("id=tr_test_paid").length, 64);
assert.notEqual(
  createBillingEventHash("id=tr_test_paid", "pending"),
  createBillingEventHash("id=tr_test_paid", "paid")
);
assert.equal(
  createBillingEventHash("id=tr_test_paid", "paid"),
  createBillingEventHash("id=tr_test_paid", "paid")
);

const serviceSource = await readFile("src/server/billing/service.ts", "utf8");
const routeSource = await readFile(
  "src/app/api/billing/mollie/webhook/route.ts",
  "utf8"
);
assert.match(serviceSource, /payloadHash/);
assert.match(serviceSource, /processingStatus: "pending"/);
assert.match(serviceSource, /invoice\.status === "paid"|decision === "ignore"/);
assert.match(serviceSource, /workspaceEntitlements/);
assert.match(serviceSource, /status: "active"/);
assert.match(routeSource, /BillingWebhookAuthorizationError/);
assert.equal(requests.length, 2);

console.log("Mollie billing coverage passed.");
