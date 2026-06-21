import { createHash, randomBytes } from "node:crypto";

import {
  billingIntervals,
  type BillingInterval,
  type BillingInvoiceStatus,
  type BillingSubscriptionStatus
} from "../../types/billing.ts";
import {
  planKeys,
  type EntitlementStatus,
  type PlanKey
} from "../../types/entitlement.ts";
import { getFichrPlan } from "../entitlements/plans.ts";

export type ProviderPaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "canceled"
  | "expired";

export function parseCheckoutSelection(input: {
  interval: string;
  planKey: string;
}): {
  amountCents: number;
  interval: BillingInterval;
  planKey: Exclude<PlanKey, "demo">;
} {
  if (
    !planKeys.includes(input.planKey as PlanKey) ||
    input.planKey === "demo"
  ) {
    throw new Error("Plan de facturation inconnu.");
  }

  if (!billingIntervals.includes(input.interval as BillingInterval)) {
    throw new Error("Période de facturation inconnue.");
  }

  const planKey = input.planKey as Exclude<PlanKey, "demo">;
  const interval = input.interval as BillingInterval;

  return {
    amountCents: getFichrPlan(planKey).prices[interval],
    interval,
    planKey
  };
}

export function createInvoiceNumber(
  date = new Date(),
  entropy = randomBytes(4)
): string {
  const year = date.getUTCFullYear();
  const suffix = Buffer.from(entropy).toString("hex").toUpperCase();
  return `FICHR-${year}-${suffix}`;
}

export function createBillingPayloadHash(rawPayload: string): string {
  return createHash("sha256").update(rawPayload).digest("hex");
}

export function createBillingEventHash(
  rawPayload: string,
  status: ProviderPaymentStatus
): string {
  return createBillingPayloadHash(`${rawPayload}\nstatus:${status}`);
}

export function getBillingPeriod(input: {
  interval: BillingInterval;
  start?: Date;
}): { end: string; start: string } {
  const start = input.start ?? new Date();
  const end = new Date(start);

  if (input.interval === "year") {
    end.setUTCFullYear(end.getUTCFullYear() + 1);
  } else {
    end.setUTCMonth(end.getUTCMonth() + 1);
  }

  return { end: end.toISOString(), start: start.toISOString() };
}

export function mapPaymentStatus(status: ProviderPaymentStatus): {
  entitlementStatus: EntitlementStatus | null;
  invoiceStatus: BillingInvoiceStatus;
  subscriptionStatus: BillingSubscriptionStatus | null;
} {
  if (status === "paid") {
    return {
      entitlementStatus: "active",
      invoiceStatus: "paid",
      subscriptionStatus: "active"
    };
  }

  if (status === "canceled") {
    return {
      entitlementStatus: null,
      invoiceStatus: "canceled",
      subscriptionStatus: null
    };
  }

  if (status === "failed" || status === "expired") {
    return {
      entitlementStatus: null,
      invoiceStatus: "failed",
      subscriptionStatus: null
    };
  }

  return {
    entitlementStatus: null,
    invoiceStatus: "pending",
    subscriptionStatus: null
  };
}

export function getWebhookPaymentDecision(input: {
  currentInvoiceStatus: BillingInvoiceStatus;
  paymentStatus: ProviderPaymentStatus;
}): "activate" | "ignore" | "update" {
  if (input.currentInvoiceStatus === "paid") {
    return "ignore";
  }

  return input.paymentStatus === "paid" ? "activate" : "update";
}
